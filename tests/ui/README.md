# Browser tests

Each file drives real browser windows against a fake database and checks what a
coach would see. They are slower than `tests/run.js`, so they are run by hand
rather than on every change.

    node tests/ui/smt.js       # Simple mode: the defense step, and the catch-up prompt when the ball goes over
    node tests/ui/qlt.js       # Simple mode: Same as last play, and the one-tap looks from tonight
    node tests/ui/lk.js        # View-only accounts: nothing on any tab can be tapped or typed into
    node tests/ui/gst.js       # Call sheet: fit to the screen, full screen, and the per-device settings
    node tests/ui/tdt.js       # "Their defense": two devices on one game, in Fast and in Full
    node tests/ui/mk.js        # Mock game: the call sheet follows the same fit rules
    node tests/ui/mz.js       # Mock game data: full self scout + charted live, file-by-file sends, this week's call sheet
    node tests/ui/tc.js       # Text Coach: players pick the coach by name; Coaches box on Player Quizzes
    node tests/ui/qk.js       # Quiz upgrades: this week's plays + look, Learn it, speed round, Friday check, streaks, readiness
    node tests/ui/pz.js       # WR / TE pass quiz: line up, route, first read on every play; saves as a pass quiz; coach filter
    node tests/ui/qz.js       # Player quiz: a player saves an attempt with no account; the coach page lists and deletes it
    node tests/ui/pl.js        # Matchup Predictor: learning from past games, and the why-panel on Game Impact
    node tests/ui/hm.js        # Home screen: every coach page can be reached from home, on an iPad and a phone
    node tests/ui/fq.js        # Film quiz: coach builds one from Hudl clips + export, a player takes it on a phone (needs ffmpeg)

Each prints `N passed, N failed` and exits non-zero on a failure.
Screenshots are written to `$SHOT_DIR` (a temp folder by default):

    SHOT_DIR=/tmp/shots/ node tests/ui/gst.js

`tdt.js` and `pl.js` each start their own copy of the fake database, so run one
at a time.

When a check fails, read the sentence it prints before assuming the app broke:
some of these pin down a default (which sheet view the call sheet opens in, for
instance), so changing a default on purpose means updating the expectation here.
