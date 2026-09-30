"""Export the exact sample-level predictions behind the SOP 2 notebook.

This script intentionally mirrors SOP2_Evaluation.ipynb:

* deterministic stratified 80/20 split (random_state=42)
* custom multinomial Naive Bayes with add-one/Laplace smoothing
* vaderSentiment compound score transformed with max(0, -compound)
* 60% Naive Bayes + 40% VADER hybrid score
* fixed 0.50 decision threshold

Blocklist and whitelist overrides are browser features and are deliberately
disabled here so the three algorithms are compared on identical test samples.
The notebook currently evaluates complete comments; the browser's separate
128-token runtime limit is therefore not applied by this reproduction script.
"""

from __future__ import annotations

import argparse
import math
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATASET = BASE_DIR / "data" / "dataset.csv"
DEFAULT_PREDICTIONS = BASE_DIR / "model" / "sop2_test_predictions.csv"
DEFAULT_METRICS = BASE_DIR / "model" / "sop2_metrics_from_predictions.csv"

TEST_SIZE = 0.20
RANDOM_STATE = 42
THRESHOLD = 0.50
NB_WEIGHT = 0.60
VADER_WEIGHT = 0.40

STOP_WORDS = {
    "a", "an", "the", "is", "it", "in", "on", "at", "to", "for", "of", "and",
    "or", "but", "this", "that", "with", "was", "be", "are", "as", "by", "i",
    "you", "we", "they", "he", "she", "my", "your", "our", "its", "do", "did",
    "have", "has", "had", "not", "no", "so", "if", "can", "will", "just", "up",
}


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-z]+", text.lower())
    return [token for token in tokens if token not in STOP_WORDS and len(token) > 1]


def train_naive_bayes(texts: list[str], labels: list[int]) -> dict:
    class_counts: defaultdict[int, int] = defaultdict(int)
    word_counts = {0: defaultdict(int), 1: defaultdict(int)}
    vocabulary: set[str] = set()

    for text, label in zip(texts, labels):
        class_counts[label] += 1
        for token in tokenize(text):
            word_counts[label][token] += 1
            vocabulary.add(token)

    total_documents = len(texts)
    vocabulary_size = len(vocabulary)
    log_prior = {
        str(label): math.log(class_counts[label] / total_documents)
        for label in (0, 1)
    }
    log_likelihood: dict[str, dict[str, float]] = {}
    for label in (0, 1):
        smoothed_total = sum(word_counts[label].values()) + vocabulary_size
        log_likelihood[str(label)] = {
            word: math.log((word_counts[label].get(word, 0) + 1) / smoothed_total)
            for word in vocabulary
        }

    return {
        "log_prior": log_prior,
        "log_likelihood": log_likelihood,
        "vocab_size": vocabulary_size,
    }


def naive_bayes_score(text: str, model: dict) -> float:
    safe_log_score = model["log_prior"]["0"]
    aggressive_log_score = model["log_prior"]["1"]
    for token in tokenize(text):
        safe_log_score += model["log_likelihood"]["0"].get(token, 0)
        aggressive_log_score += model["log_likelihood"]["1"].get(token, 0)

    maximum = max(safe_log_score, aggressive_log_score)
    aggressive_exponential = math.exp(aggressive_log_score - maximum)
    safe_exponential = math.exp(safe_log_score - maximum)
    return aggressive_exponential / (safe_exponential + aggressive_exponential)


def class_name(label: int) -> str:
    return "Aggressive" if int(label) == 1 else "Non-aggressive"


def metric_row(model_name: str, actual: pd.Series, predicted: pd.Series) -> dict:
    tn, fp, fn, tp = confusion_matrix(actual, predicted, labels=[0, 1]).ravel()
    return {
        "model": model_name,
        "precision": precision_score(actual, predicted, zero_division=0),
        "recall": recall_score(actual, predicted, zero_division=0),
        "f1_score": f1_score(actual, predicted, zero_division=0),
        "accuracy": accuracy_score(actual, predicted),
        "true_negative": int(tn),
        "false_positive": int(fp),
        "false_negative": int(fn),
        "true_positive": int(tp),
    }


def export_predictions(dataset_path: Path, predictions_path: Path, metrics_path: Path) -> None:
    frame = pd.read_csv(dataset_path, usecols=["text", "label"]).dropna().copy()
    frame["label"] = frame["label"].astype(int)
    frame["dataset_index"] = frame.index

    train_frame, test_frame = train_test_split(
        frame,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=frame["label"],
    )
    model = train_naive_bayes(
        train_frame["text"].tolist(),
        train_frame["label"].tolist(),
    )
    analyzer = SentimentIntensityAnalyzer()

    print(f"Dataset: {len(frame):,} samples")
    print(f"Training: {len(train_frame):,}; testing: {len(test_frame):,}")
    print(f"Naive Bayes vocabulary: {model['vocab_size']:,} tokens")
    print("Scoring the shared test set...")

    output = test_frame[["dataset_index", "text", "label"]].copy()
    output.insert(0, "sample_id", range(1, len(output) + 1))
    output = output.rename(columns={"label": "actual_label"})
    output["actual_class"] = output["actual_label"].map(class_name)

    output["naive_bayes_score"] = output["text"].map(
        lambda text: naive_bayes_score(text, model)
    )
    output["vader_compound"] = output["text"].map(
        lambda text: analyzer.polarity_scores(text)["compound"]
    )
    output["vader_aggression_score"] = output["vader_compound"].map(
        lambda compound: max(0.0, -compound)
    )
    output["hybrid_score"] = (
        NB_WEIGHT * output["naive_bayes_score"]
        + VADER_WEIGHT * output["vader_aggression_score"]
    )

    prediction_specs = (
        ("naive_bayes", "naive_bayes_score"),
        ("vader", "vader_aggression_score"),
        ("hybrid", "hybrid_score"),
    )
    for prefix, score_column in prediction_specs:
        prediction_column = f"{prefix}_prediction"
        output[prediction_column] = (output[score_column] >= THRESHOLD).astype(int)
        output[f"{prefix}_predicted_class"] = output[prediction_column].map(class_name)

    ordered_columns = [
        "sample_id",
        "dataset_index",
        "text",
        "actual_label",
        "actual_class",
        "naive_bayes_score",
        "naive_bayes_prediction",
        "naive_bayes_predicted_class",
        "vader_compound",
        "vader_aggression_score",
        "vader_prediction",
        "vader_predicted_class",
        "hybrid_score",
        "hybrid_prediction",
        "hybrid_predicted_class",
    ]
    output = output[ordered_columns]

    metrics = pd.DataFrame([
        metric_row(
            "Naive Bayes",
            output["actual_label"],
            output["naive_bayes_prediction"],
        ),
        metric_row(
            "VADER",
            output["actual_label"],
            output["vader_prediction"],
        ),
        metric_row(
            "Hybrid (60% NB / 40% VADER)",
            output["actual_label"],
            output["hybrid_prediction"],
        ),
    ])

    predictions_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(predictions_path, index=False, encoding="utf-8")
    metrics.to_csv(metrics_path, index=False, encoding="utf-8")

    print(f"Predictions written to: {predictions_path}")
    print(f"Metrics written to: {metrics_path}")
    print(metrics.to_string(index=False, float_format=lambda value: f"{value:.6f}"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--predictions", type=Path, default=DEFAULT_PREDICTIONS)
    parser.add_argument("--metrics", type=Path, default=DEFAULT_METRICS)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    export_predictions(arguments.dataset, arguments.predictions, arguments.metrics)
