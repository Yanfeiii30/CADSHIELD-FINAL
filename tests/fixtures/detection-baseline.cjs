'use strict';

// Hand-authored diagnostic examples, not a representative accuracy benchmark.
// Labels describe targeted aggression, rather than negative sentiment alone.
const groups = {
  direct_insults: [
    [1, 'You are a worthless idiot.'],
    [1, 'You are an incompetent moron.'],
    [1, 'You are disgusting and nobody wants you here.'],
    [0, 'Your answer is incorrect; please check the calculation.'],
    [0, 'I disagree with your argument.'],
    [0, 'This explanation needs more evidence.'],
  ],
  threats: [
    [1, 'I will find you and break your neck.'],
    [1, 'I am going to stab you tomorrow.'],
    [1, 'I know where you live. You will not make it home tonight.'],
    [0, 'I will find you a better seat tomorrow.'],
    [0, 'Please do not threaten anyone.'],
    [0, 'We need to prevent violence and protect people.'],
  ],
  exclusion_and_harm: [
    [1, 'Nobody wants you here. Go away forever.'],
    [1, 'Everyone should block her and make her life miserable.'],
    [1, 'Do everyone a favor and end your life.'],
    [0, 'You belong here and we want you to stay.'],
    [0, 'Please leave this private meeting; you can join the public session.'],
    [0, 'I need some time alone today.'],
  ],
  slang: [
    [1, 'u r a worthless 1d0it'],
    [1, 'stfu you pathetic clown'],
    [1, 'You are a total waste of oxygen.'],
    [0, 'You ate that performance, absolutely amazing!'],
    [0, 'That joke has me dead, so funny.'],
    [0, 'We cooked dinner together.'],
  ],
  negation: [
    [1, 'You are not smart. You are a worthless idiot.'],
    [1, 'You are a moron, not a genius.'],
    [1, 'Do not pretend you are anything but a disgusting loser.'],
    [0, 'You are not stupid.'],
    [0, 'You are not a worthless idiot.'],
    [0, 'Never call someone a moron.'],
  ],
  quotation_and_reporting: [
    [1, 'I mean it when I say you are a worthless idiot.'],
    [1, 'My message to you is: you are a disgusting loser.'],
    [1, 'I am telling everyone that you are a pathetic moron.'],
    [0, 'Someone called me a worthless idiot and I need help reporting it.'],
    [0, 'The moderator removed a comment that said "go kill yourself".'],
    [0, 'Calling people stupid is unacceptable.'],
  ],
  praise_and_profanity: [
    [1, 'You are a fucking worthless idiot.'],
    [1, 'You are pathetic, but your presentation looks great.'],
    [1, 'Great work, idiot. You ruined everything again.'],
    [0, 'You did a fucking amazing job.'],
    [0, 'You killed it out there! Destroyed the opposition!'],
    [0, 'Nice job!'],
  ],
  ordinary_words: [
    [0, 'The class assignment is about classic artwork.'],
    [0, 'I will assist you with the assessment.'],
    [0, 'The shirt is on the shelf beside the duck picture.'],
    [0, 'The battery is dead and the screen is broken.'],
    [0, 'This awful weather ruined my picnic.'],
    [0, 'Version 3.14 works with the public account.'],
  ],
  obfuscation: [
    [1, 'You are a worthless 1d10t.'],
    [1, 'You are an i.d.i.o.t.'],
    [1, 'You are a stuuupid moron.'],
    [1, 'You are a m0r*n.'],
    [1, 'You are st\u200bupid.'],
    [1, 'You are st\u00fapid.'],
    [1, 'You are an !d!ot.'],
    [1, 'You are a |d|ot.'],
    [1, 'You are a stup!d-m0r0n.'],
    [1, 'You are a st00pid l00ser.'],
    [1, 'You are a stvp1d person.'],
    [1, 'You are a s t u p i d person.'],
    [0, 'You are not stup1dd.'],
    [0, 'You are not an 1d0it.'],
    [0, 'The code is A1B2 and the price is $5.'],
    [0, 'The caf\u00e9 has a beautiful menu.'],
  ],
};

const cases = Object.entries(groups).flatMap(([category, rows]) => rows.map(([aggressive, text], i) => ({
  id: `${category}-${String(i + 1).padStart(2, '0')}`,
  category, text, expected: aggressive ? 'aggressive' : 'safe',
})));
const neutralPrefix = 'The meeting is scheduled for Monday and the agenda is available online. '.repeat(12);
cases.push(
  { id: 'long_text-01', category: 'long_text', expected: 'aggressive', text: neutralPrefix + 'You are a worthless disgusting idiot.' },
  { id: 'long_text-02', category: 'long_text', expected: 'aggressive', text: 'You are a worthless disgusting idiot. ' + neutralPrefix },
  { id: 'long_text-03', category: 'long_text', expected: 'safe', text: neutralPrefix + 'Thank you for your help.' },
  { id: 'long_text-04', category: 'long_text', expected: 'safe', text: 'Thank you for your help. ' + neutralPrefix },
);
module.exports = cases;
