"""
format_dataset.py
─────────────────────────────────────────────────────────────
Converts the Jigsaw Toxic Comment Classification dataset into
the format required by SOP2_Evaluation.ipynb:
    columns: text, label
    label  : 1 = aggressive, 0 = non-aggressive

Usage:
    python format_dataset.py

Place your downloaded 'train.csv' from Kaggle in the same folder
as this script (TRAINING/data/), then run it.
Output will be saved as 'dataset.csv' in the same folder.
─────────────────────────────────────────────────────────────
"""

import pandas as pd
import os
import re

# ─── PATHS ────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
INPUT_PATH  = os.path.join(BASE_DIR, 'train.csv')
OUTPUT_PATH = os.path.join(BASE_DIR, 'dataset.csv')

# ─── STEP 1: LOAD ─────────────────────────────────────────────
print("📂 Loading Jigsaw dataset...")

if not os.path.exists(INPUT_PATH):
    print(f"\n❌ ERROR: 'train.csv' not found in {BASE_DIR}")
    print("👉 Please move your downloaded Jigsaw train.csv into:")
    print(f"   {BASE_DIR}")
    exit(1)

df = pd.read_csv(INPUT_PATH)
print(f"✅ Loaded {len(df):,} rows")
print(f"   Columns found: {list(df.columns)}\n")

# ─── STEP 2: CREATE BINARY LABEL ──────────────────────────────
# Jigsaw has multiple toxicity columns:
# toxic | severe_toxic | obscene | threat | insult | identity_hate
# We treat a comment as aggressive (1) if ANY of these = 1

toxic_cols = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate']

# Verify columns exist
missing = [c for c in toxic_cols if c not in df.columns]
if missing:
    print(f"⚠️  Warning: These columns were not found: {missing}")
    toxic_cols = [c for c in toxic_cols if c in df.columns]

df['label'] = df[toxic_cols].max(axis=1).astype(int)

# ─── STEP 3: RENAME TEXT COLUMN ───────────────────────────────
df = df.rename(columns={'comment_text': 'text'})

# ─── STEP 4: KEEP ONLY NEEDED COLUMNS ────────────────────────
df = df[['text', 'label']].copy()

# ─── STEP 5: CLEAN ────────────────────────────────────────────
print("🧹 Cleaning data...")
before = len(df)
df = df.dropna(subset=['text', 'label'])
df = df[df['text'].str.strip() != '']
df['text']  = df['text'].astype(str).str.strip()
df['label'] = df['label'].astype(int)
after = len(df)
print(f"   Removed {before - after:,} empty/null rows")

# ─── STEP 6: BALANCE DATASET ──────────────────────────────────
# Jigsaw is heavily imbalanced (~90% non-aggressive)
# We balance it so the model doesn't just predict "safe" for everything

print("\n⚖️  Balancing dataset...")
aggressive     = df[df['label'] == 1]
non_aggressive = df[df['label'] == 0]

print(f"   Aggressive     : {len(aggressive):,}")
print(f"   Non-aggressive : {len(non_aggressive):,}")

# Match non-aggressive count to aggressive count (max 3x to keep enough data)
target_non_agg = min(len(non_aggressive), len(aggressive) * 3)
non_aggressive_sampled = non_aggressive.sample(n=target_non_agg, random_state=42)

df_balanced = pd.concat([aggressive, non_aggressive_sampled]).sample(
    frac=1, random_state=42
).reset_index(drop=True)

print(f"\n   After balancing:")
print(f"   Aggressive     : {len(df_balanced[df_balanced['label'] == 1]):,}")
print(f"   Non-aggressive : {len(df_balanced[df_balanced['label'] == 0]):,}")
print(f"   Total          : {len(df_balanced):,}")

# ─── STEP 7: SAVE ─────────────────────────────────────────────
df_balanced.to_csv(OUTPUT_PATH, index=False)
print(f"\n💾 Saved to: {OUTPUT_PATH}")
print("✅ Done! Open TRAINING/SOP2_Evaluation.ipynb and run all cells.")

# ─── STEP 8: PREVIEW ──────────────────────────────────────────
print("\n─── Sample Rows ───────────────────────────────────────")
print(df_balanced[['text', 'label']].head(5).to_string(index=False))
print("───────────────────────────────────────────────────────")
