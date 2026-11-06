/* Plate — workouts of the day. Ids are permanent: saved results refer to them, so never rename one.
   Each workout has three versions of the same idea. A level is [minutes, scheme, moves], where minutes is
   the time cap (for_time) or the length (amrap, emom), and a move is [text, optional exercise id for the how-to]. */
self.PLATE_WODS = [
  /* ---------- The daily rotation ----------
     A level is { minutes, scheme, moves, note, strength } where strength = { scheme, moves } is an
     optional Part A done before the timed piece. Weights are written in pounds as {women/men} or {one},
     and the app shows them in the viewer's unit. Intervals and Tabata set work, rest (seconds) and count
     instead of minutes; EMOMs can set every (seconds). scoreType overrides how a format is scored. */
  { id: 'there-and-back', name: 'There and Back', format: 'for_time', equipment: ['jumprope', 'wallball', 'kettlebell', 'box', 'barbell'],
    about: 'A chipper that turns around halfway: down the list, then back up it. Expect 18 to 24 minutes. Break sets early rather than late.',
    warmup: ['2 minutes easy jump rope', '10 air squats, 10 good mornings with an empty bar', '2 rounds: 5 hang power cleans with the empty bar, 5 box step-ups each leg', '3 practice wall-ball shots, then 3 kettlebell swings at your working weight'],
    levels: {
      beginner: { minutes: 22, scheme: 'For time, top to bottom and back up', moves: [['50 single-unders', 'jump-rope'], ['20 wall-ball shots, {6/10} ball', 'wall-ball'], ['15 kettlebell deadlifts, {18/26}', 'kettlebell-swing'], ['10 box step-ups, 12 in', 'box-step-up'], ['8 dumbbell hang cleans, {15/20}', 'dumbbell-hang-clean'], ['Then 10 step-ups, 15 deadlifts, 20 wall-balls and 50 single-unders']],
        note: 'Rest whenever you need to. Finishing every rep with good form is the win today.' },
      intermediate: { minutes: 24, scheme: 'For time, top to bottom and back up', moves: [['30 double-unders, or 75 single-unders', 'double-under'], ['30 wall-ball shots, {10/14} ball', 'wall-ball'], ['20 kettlebell swings, {26/35}', 'kettlebell-swing'], ['15 box jumps, 20 in', 'box-jump'], ['8 power cleans, {65/95}', 'barbell-power-clean'], ['Then 15 box jumps, 20 swings, 30 wall-balls and 30 double-unders']] },
      advanced: { minutes: 25, scheme: 'For time, top to bottom and back up', moves: [['50 double-unders', 'double-under'], ['40 wall-ball shots, {14/20} ball', 'wall-ball'], ['30 kettlebell swings, {35/53}', 'kettlebell-swing'], ['20 box jumps, 20/24 in', 'box-jump'], ['10 power cleans, {95/135}', 'barbell-power-clean'], ['Then 20 box jumps, 30 swings, 40 wall-balls and 50 double-unders']] } } },

  { id: 'redline-rounds', name: 'Redline Rounds', format: 'intervals', equipment: ['rower', 'dumbbell'], work: 180, rest: 60, count: 5,
    about: 'Each 3-minute round starts with a buy-in, and whatever time is left goes into dumbbell snatches. Your score is total snatches across all rounds, so a fast buy-in pays off.',
    warmup: ['3 minutes easy rowing, building pace', '2 rounds: 5 burpees, 5 dumbbell hang cleans and 5 snatches each arm, light', '1 hard 20-second row to feel the pace'],
    levels: {
      beginner: { count: 4, scheme: 'Each round: buy-in, then max snatches until the round ends', moves: [['Row 8 calories', 'rowing-machine'], ['5 step-back burpees', 'burpee'], ['Max alternating dumbbell snatches, {10/20}', 'dumbbell-snatch']],
        note: 'If the snatch feels awkward, do dumbbell hang cleans instead. Score: total reps of the last movement.' },
      intermediate: { scheme: 'Each round: buy-in, then max snatches until the round ends', moves: [['Row 12 calories', 'rowing-machine'], ['8 burpees', 'burpee'], ['Max alternating dumbbell snatches, {20/35}', 'dumbbell-snatch']] },
      advanced: { scheme: 'Each round: buy-in, then max snatches until the round ends', moves: [['Row 15/18 calories', 'rowing-machine'], ['10 burpees', 'burpee'], ['Max alternating dumbbell snatches, {35/50}', 'dumbbell-snatch']] } } },

  { id: 'swing-and-press', name: 'Swing and Press', format: 'tabata', equipment: ['kettlebell', 'none'], count: 16,
    about: 'Eight minutes, alternating two movements every 20 seconds. Count every rep: your score is the total. Go hard in each 20-second burst.',
    warmup: ['2 minutes of jumping jacks and arm circles', '10 kettlebell deadlifts, 10 light swings', '2 rounds: 5 push-ups, 10-second plank'],
    levels: {
      beginner: { scheme: '16 rounds, alternating the two movements', moves: [['Odd rounds: kettlebell deadlifts, {18/26}', 'kettlebell-swing'], ['Even rounds: incline push-ups', 'incline-push-up']],
        note: 'Rest is only 10 seconds. If you need more, take it and pick back up on the next work round.' },
      intermediate: { scheme: '16 rounds, alternating the two movements', moves: [['Odd rounds: kettlebell swings, {26/35}', 'kettlebell-swing'], ['Even rounds: push-ups', 'push-up']] },
      advanced: { scheme: '16 rounds, alternating the two movements', moves: [['Odd rounds: kettlebell swings, {35/53}', 'kettlebell-swing'], ['Even rounds: push-ups', 'push-up']] } } },

  { id: 'climbing-pairs', name: 'Climbing Pairs', format: 'death_by', equipment: ['box', 'pullup'],
    about: 'Every minute, do the reps for that minute. They grow each minute. Keep going until you can no longer finish inside the minute. Score: full minutes, plus reps in the last one.',
    warmup: ['2 minutes easy cardio', '10 hanging knee raises or 10 sit-ups', '5 box jumps or step-ups at a low height', '30-second dead hang'],
    levels: {
      beginner: { minutes: 15, scheme: 'Minute 1: 1 of each. Minute 2: 2 of each. Keep adding 1', moves: [['Box step-ups, 12 in', 'box-step-up'], ['Sit-ups', 'sit-up']],
        note: 'Stop when the reps no longer fit inside a minute, or at 15 minutes.' },
      intermediate: { minutes: 18, scheme: 'Minute 1: 2 of each. Minute 2: 4 of each. Keep adding 2', moves: [['Box jumps, 20 in', 'box-jump'], ['Hanging knee raises', 'hanging-knee-raise']] },
      advanced: { minutes: 20, scheme: 'Minute 1: 2 of each. Minute 2: 4 of each. Keep adding 2', moves: [['Box jumps, 20/24 in', 'box-jump'], ['Toes-to-bar', 'toes-to-bar']] } } },

  { id: 'squat-then-sprint', name: 'Squat, Then Sprint', format: 'amrap', equipment: ['barbell', 'jumprope', 'none'],
    about: 'Part A is heavy. Part B is a short, fast AMRAP. Rest 3 to 5 minutes between them. The AMRAP should feel like a steady sprint.',
    warmup: ['3 minutes easy cardio', '10 air squats, 10 lunges, 5 inchworms', 'Back squat: build up with sets of 5 from the empty bar'],
    levels: {
      beginner: { minutes: 7, scheme: 'Part B: AMRAP', strength: { scheme: 'Part A: Goblet squat, 5 sets of 5, building', moves: [['Goblet squat, rest 90 seconds between sets', 'goblet-squat']] },
        moves: [['6 incline push-ups', 'incline-push-up'], ['10 sit-ups', 'sit-up'], ['30 single-unders', 'jump-rope']], note: 'In Part A, stop adding weight if your heels lift or your back rounds.' },
      intermediate: { minutes: 8, scheme: 'Part B: AMRAP', strength: { scheme: 'Part A: Back squat, 5 sets of 5, building', moves: [['Back squat, rest 2 minutes between sets', 'barbell-back-squat']] },
        moves: [['10 push-ups', 'push-up'], ['15 sit-ups', 'sit-up'], ['20 double-unders, or 50 single-unders', 'double-under']] },
      advanced: { minutes: 8, scheme: 'Part B: AMRAP', strength: { scheme: 'Part A: Back squat, 5-5-5-5-5, building to a heavy 5', moves: [['Back squat, rest 2 to 3 minutes between sets', 'barbell-back-squat']] },
        moves: [['12 push-ups', 'push-up'], ['15 sit-ups', 'sit-up'], ['30 double-unders', 'double-under']] } } },

  { id: 'heavy-single-day', name: 'Heavy Single Day', format: 'for_load', equipment: ['barbell'],
    about: 'No race today. Build to a heavy deadlift over the window, resting fully between sets. Score: your heaviest good lift. Stop before your form breaks.',
    warmup: ['3 minutes easy rowing or biking', '10 glute bridges, 10 good mornings with the empty bar', 'Deadlift: 2 sets of 5 at light weight, then 3 at medium'],
    levels: {
      beginner: { minutes: 15, scheme: 'Build to a solid 5 reps', moves: [['Deadlift: sets of 5, adding a little weight each set', 'conventional-deadlift']],
        note: 'A dumbbell or kettlebell Romanian deadlift is fine if you are new to the barbell. Score the heaviest set of 5 that looked the same as the first.' },
      intermediate: { minutes: 15, scheme: 'Build to a heavy 3', moves: [['Deadlift: sets of 3', 'conventional-deadlift']] },
      advanced: { minutes: 18, scheme: 'Build to a heavy single', moves: [['Deadlift: 5, 3, 2, then singles', 'conventional-deadlift']] } } },

  { id: 'four-corners', name: 'Four Corners', format: 'emom', equipment: ['rower', 'barbell', 'none'],
    about: 'A different station every minute, four stations round and round. Aim for 15 to 20 seconds of rest in each minute. Score: the minutes you finished in time.',
    warmup: ['3 minutes easy rowing', '2 rounds: 5 hang power cleans with an empty bar, 5 pike push-ups, 20-second plank'],
    levels: {
      beginner: { minutes: 12, scheme: 'Every minute, cycling through four stations', moves: [['Minute 1: row 8 calories', 'rowing-machine'], ['Minute 2: 6 dumbbell hang cleans, {15/20}', 'dumbbell-hang-clean'], ['Minute 3: 6 pike push-ups from the knees', 'pike-push-up'], ['Minute 4: 30-second plank', 'plank']] },
      intermediate: { minutes: 16, scheme: 'Every minute, cycling through four stations', moves: [['Minute 1: row 12 calories', 'rowing-machine'], ['Minute 2: 6 power cleans, {65/95}', 'barbell-power-clean'], ['Minute 3: 8 pike push-ups', 'pike-push-up'], ['Minute 4: 40-second plank', 'plank']] },
      advanced: { minutes: 20, scheme: 'Every minute, cycling through four stations', moves: [['Minute 1: row 14/18 calories', 'rowing-machine'], ['Minute 2: 6 hang power cleans, {95/135}', 'hang-power-clean'], ['Minute 3: 6 handstand push-ups', 'handstand-push-up'], ['Minute 4: 45-second hollow hold', 'hollow-hold']] } } },

  { id: 'three-minute-windows', name: 'Three-Minute Windows', format: 'emom', equipment: ['bike', 'barbell'], every: 180,
    about: 'Every 3 minutes, finish the round and rest for the rest of the window. Keep each round under about 2 minutes so you get real rest. Score: rounds finished inside the window.',
    warmup: ['3 minutes easy biking', '2 rounds: 5 front squats and 5 push presses with an empty bar', '1 practice round at half speed'],
    levels: {
      beginner: { minutes: 15, scheme: 'Every 3 minutes, 5 rounds', moves: [['Bike 8 calories', 'air-bike'], ['8 dumbbell thrusters, {10/15}', 'dumbbell-thruster']] },
      intermediate: { minutes: 18, scheme: 'Every 3 minutes, 6 rounds', moves: [['Bike 12 calories', 'air-bike'], ['10 thrusters, {45/65}', 'barbell-thruster']] },
      advanced: { minutes: 21, scheme: 'Every 3 minutes, 7 rounds', moves: [['Bike 15/20 calories', 'air-bike'], ['10 thrusters, {65/95}', 'barbell-thruster']] } } },

  { id: 'long-haul', name: 'The Long Haul', format: 'for_time', equipment: ['kettlebell', 'pullup', 'none'],
    about: 'A long, steady effort. Pick a pace you could hold for the whole thing on the first round. Expect 25 to 35 minutes.',
    warmup: ['400 m easy jog', '10 kettlebell swings, 10 sit-ups, 5 pull-ups or ring rows'],
    levels: {
      beginner: { minutes: 30, scheme: '3 rounds for time', moves: [['Run or walk 400 m', 'run'], ['15 kettlebell deadlifts, {18/26}', 'kettlebell-swing'], ['15 sit-ups', 'sit-up'], ['8 ring or inverted rows', 'inverted-row']] },
      intermediate: { minutes: 35, scheme: '4 rounds for time', moves: [['Run 600 m', 'run'], ['20 kettlebell swings, {26/35}', 'kettlebell-swing'], ['20 sit-ups', 'sit-up'], ['8 pull-ups or 12 jumping pull-ups', 'pull-up']] },
      advanced: { minutes: 40, scheme: '4 rounds for time', moves: [['Run 800 m', 'run'], ['30 kettlebell swings, {35/53}', 'kettlebell-swing'], ['20 sit-ups', 'sit-up'], ['12 pull-ups', 'pull-up']] } } },

  { id: 'grinder', name: 'The Grinder', format: 'amrap', equipment: ['dumbbell', 'pullup'],
    about: 'Twenty minutes of steady work. Every round should look the same. Strict pulling makes it slow on purpose.',
    warmup: ['3 minutes easy cardio', '2 rounds: 5 strict pull-ups or ring rows, 5 dumbbell push presses, 5 lunges each leg'],
    levels: {
      beginner: { minutes: 15, scheme: 'AMRAP', moves: [['5 ring or inverted rows', 'inverted-row'], ['8 dumbbell shoulder presses, {10/15}', 'dumbbell-shoulder-press'], ['10 alternating reverse lunges, bodyweight', 'dumbbell-reverse-lunge']] },
      intermediate: { minutes: 20, scheme: 'AMRAP', moves: [['4 strict pull-ups or 6 jumping pull-ups', 'pull-up'], ['10 dumbbell push presses, {20/35}', 'push-press'], ['14 alternating dumbbell lunges, {20/35}', 'dumbbell-walking-lunge']] },
      advanced: { minutes: 20, scheme: 'AMRAP', moves: [['6 strict pull-ups', 'pull-up'], ['10 dumbbell push presses, {35/50}', 'push-press'], ['16 alternating dumbbell lunges, {35/50}', 'dumbbell-walking-lunge']] } } },

  { id: 'pull-and-burpee', name: 'Pull and Burpee', format: 'for_time', equipment: ['barbell', 'none'],
    about: 'A short, hard couplet. Try to keep the bar moving and step straight into the burpees. Expect 6 to 10 minutes.',
    warmup: ['3 minutes easy cardio', '2 rounds: 5 sumo deadlift high pulls with an empty bar, 5 burpees'],
    levels: {
      beginner: { minutes: 12, scheme: '15-12-9 reps of each', moves: [['Kettlebell sumo deadlift, {26/35}', 'sumo-deadlift'], ['Step-back burpee', 'burpee']] },
      intermediate: { minutes: 12, scheme: '21-15-9 reps of each', moves: [['Sumo deadlift high pull, {55/75}', 'sumo-deadlift-high-pull'], ['Burpee', 'burpee']] },
      advanced: { minutes: 12, scheme: '21-15-9 reps of each', moves: [['Sumo deadlift high pull, {75/95}', 'sumo-deadlift-high-pull'], ['Burpee over the bar', 'burpee']] } } },

  { id: 'odd-even-ball', name: 'Odd and Even', format: 'emom', equipment: ['wallball', 'pullup'],
    about: 'Two movements, alternating each minute. Go at a steady, unbroken pace you can repeat every time.',
    warmup: ['2 minutes easy cardio', '10 air squats, 10 wall-ball shots with a light ball, 10 hanging knee raises'],
    levels: {
      beginner: { minutes: 10, scheme: 'Every minute, alternating', moves: [['Odd minutes: 10 wall-ball shots, {6/10} ball', 'wall-ball'], ['Even minutes: 8 hanging knee raises or sit-ups', 'hanging-knee-raise']] },
      intermediate: { minutes: 14, scheme: 'Every minute, alternating', moves: [['Odd minutes: 14 wall-ball shots, {10/14} ball', 'wall-ball'], ['Even minutes: 10 hanging knee raises', 'hanging-knee-raise']] },
      advanced: { minutes: 16, scheme: 'Every minute, alternating', moves: [['Odd minutes: 18 wall-ball shots, {14/20} ball', 'wall-ball'], ['Even minutes: 12 toes-to-bar', 'toes-to-bar']] } } },

  { id: 'snatch-session', name: 'Snatch Session', format: 'for_load', equipment: ['barbell', 'dumbbell'],
    about: 'Technique first, then build. Find a heavy double where both reps look the same. Score: your heaviest clean set.',
    warmup: ['3 minutes easy cardio', 'With an empty bar or PVC: 5 overhead squats, 5 snatch pulls, 5 muscle snatches, 5 power snatches'],
    levels: {
      beginner: { minutes: 15, scheme: 'Build to a solid set of 5 each arm', moves: [['Dumbbell snatch: sets of 5 each arm', 'dumbbell-snatch']],
        note: 'Stay light enough to land with the dumbbell steady overhead and your elbow locked.' },
      intermediate: { minutes: 15, scheme: 'Build to a heavy 3', moves: [['Hang power snatch: sets of 3', 'hang-power-snatch']] },
      advanced: { minutes: 15, scheme: 'Build to a heavy 2', moves: [['Power snatch: sets of 2', 'power-snatch']] } } },

  { id: 'up-and-down', name: 'Up and Down', format: 'for_time', equipment: ['dumbbell', 'none'],
    about: 'A rep ladder that climbs and then falls. Pace the middle: the top of the ladder is where the clock gets away. Expect 10 to 14 minutes.',
    warmup: ['2 minutes easy cardio', '2 rounds: 5 dumbbell snatches each arm, 5 burpees, 5 air squats'],
    levels: {
      beginner: { minutes: 15, scheme: '2-4-6-8-6-4-2 reps of each', moves: [['Alternating dumbbell hang cleans, {10/15}', 'dumbbell-hang-clean'], ['Step-back burpees', 'burpee']] },
      intermediate: { minutes: 15, scheme: '2-4-6-8-10-8-6-4-2 reps of each', moves: [['Alternating dumbbell snatches, {25/35}', 'dumbbell-snatch'], ['Burpees', 'burpee']] },
      advanced: { minutes: 15, scheme: '2-4-6-8-10-8-6-4-2 reps of each', moves: [['Alternating dumbbell snatches, {35/50}', 'dumbbell-snatch'], ['Burpees over the dumbbell', 'burpee']] } } },

  { id: 'machine-swap', name: 'Machine Swap', format: 'intervals', equipment: ['bike', 'rower'], work: 120, rest: 60, count: 6,
    about: 'Six rounds of max calories, switching machines each round. Score: total calories. Find a hard pace you can hold for 2 minutes.',
    warmup: ['3 minutes easy on each machine', '3 pickups of 10 seconds at hard pace'],
    levels: {
      beginner: { count: 4, scheme: '4 rounds of max calories, alternating machines', moves: [['Odd rounds: air bike', 'air-bike'], ['Even rounds: rower', 'rowing-machine']],
        note: 'Hard, not all-out. You should be able to hold the same pace in the last round.' },
      intermediate: { scheme: '6 rounds of max calories, alternating machines', moves: [['Odd rounds: air bike', 'air-bike'], ['Even rounds: rower', 'rowing-machine']] },
      advanced: { count: 8, scheme: '8 rounds of max calories, alternating machines', moves: [['Odd rounds: air bike', 'air-bike'], ['Even rounds: rower or ski erg', 'rowing-machine']] } } },

  { id: 'midline-mixer', name: 'Midline Mixer', format: 'amrap', equipment: ['pullup', 'dumbbell'],
    about: 'Core work with a little cardio. Move smoothly and keep your lower back controlled.',
    warmup: ['2 minutes easy cardio', '10 dead bugs, 10 bird dogs, 20-second hollow hold'],
    levels: {
      beginner: { minutes: 8, scheme: 'AMRAP', moves: [['10 sit-ups', 'sit-up'], ['20-second hollow hold, knees bent', 'hollow-hold'], ['15 feet of bear crawl', 'bear-crawl']] },
      intermediate: { minutes: 10, scheme: 'AMRAP', moves: [['15 sit-ups', 'sit-up'], ['10 hanging knee raises', 'hanging-knee-raise'], ['30-second hollow hold', 'hollow-hold'], ['6 dumbbell thrusters, {15/25}', 'dumbbell-thruster']] },
      advanced: { minutes: 12, scheme: 'AMRAP', moves: [['20 sit-ups', 'sit-up'], ['10 toes-to-bar', 'toes-to-bar'], ['30-second hollow hold', 'hollow-hold'], ['5 devil presses, {35/50}', 'devil-press']] } } },

  { id: 'front-rack-row', name: 'Front Rack and Row', format: 'for_time', equipment: ['barbell', 'rower'],
    about: 'Part A builds strength. Part B is a short triplet. Rest 3 minutes between them. Expect about 10 minutes in Part B.',
    warmup: ['3 minutes easy rowing', 'Front squat: build up in sets of 3 from the empty bar'],
    levels: {
      beginner: { minutes: 15, scheme: 'Part B: 3 rounds for time', strength: { scheme: 'Part A: Goblet squat, 4 sets of 6', moves: [['Goblet squat, rest 90 seconds', 'goblet-squat']] },
        moves: [['Row 250 m', 'rowing-machine'], ['10 goblet squats, {15/25}', 'goblet-squat'], ['8 push-ups from the knees or an incline', 'incline-push-up']] },
      intermediate: { minutes: 15, scheme: 'Part B: 3 rounds for time', strength: { scheme: 'Part A: Front squat, 5 sets of 3, building', moves: [['Front squat, rest 2 minutes', 'barbell-front-squat']] },
        moves: [['Row 400 m', 'rowing-machine'], ['12 front squats, {55/85}', 'barbell-front-squat'], ['10 push-ups', 'push-up']] },
      advanced: { minutes: 15, scheme: 'Part B: 3 rounds for time', strength: { scheme: 'Part A: Front squat, 5 sets of 3, building to heavy', moves: [['Front squat, rest 2 to 3 minutes', 'barbell-front-squat']] },
        moves: [['Row 500 m', 'rowing-machine'], ['12 front squats, {75/115}', 'barbell-front-squat'], ['12 push-ups, chest to the floor', 'push-up']] } } },

  { id: 'jerk-builder', name: 'Jerk Builder', format: 'for_load', equipment: ['barbell', 'dumbbell'],
    about: 'An overhead strength day. Build to a heavy double with a locked-out finish and your feet under you. Score: your heaviest good set.',
    warmup: ['2 minutes easy cardio', '10 band pull-aparts, 10 pass-throughs', 'With an empty bar: 5 strict presses, 5 push presses, 5 push jerks'],
    levels: {
      beginner: { minutes: 12, scheme: 'Build to a solid 5', moves: [['Dumbbell shoulder press: sets of 5', 'dumbbell-shoulder-press']] },
      intermediate: { minutes: 12, scheme: 'Build to a heavy 3', moves: [['Push press: sets of 3', 'push-press']] },
      advanced: { minutes: 15, scheme: 'Build to a heavy 2', moves: [['Push jerk: sets of 2', 'push-jerk']] } } },

  { id: 'stairway', name: 'Stairway', format: 'amrap', equipment: ['dumbbell', 'pullup'],
    about: 'The rounds get longer as you go: 3 reps, then 6, then 9, and so on. Score: rounds plus reps.',
    warmup: ['2 minutes easy cardio', '2 rounds: 5 dumbbell thrusters, 5 hanging knee raises, 5 air squats'],
    levels: {
      beginner: { minutes: 10, scheme: 'AMRAP: 2 of each, then 4, then 6, adding 2 each round', moves: [['Dumbbell thruster, {10/15}', 'dumbbell-thruster'], ['Sit-up', 'sit-up']] },
      intermediate: { minutes: 12, scheme: 'AMRAP: 3 of each, then 6, then 9, adding 3 each round', moves: [['Dumbbell thruster, {20/35}', 'dumbbell-thruster'], ['Hanging knee raise', 'hanging-knee-raise']] },
      advanced: { minutes: 12, scheme: 'AMRAP: 3 of each, then 6, then 9, adding 3 each round', moves: [['Dumbbell thruster, {35/50}', 'dumbbell-thruster'], ['Toes-to-bar', 'toes-to-bar']] } } },

  { id: 'quick-hit', name: 'Quick Hit', format: 'for_time', equipment: ['bike', 'box'],
    about: 'Short and fast. Rest is your enemy here. Aim to finish in 6 to 9 minutes.',
    warmup: ['3 minutes easy biking', '2 rounds: 5 box jumps or step-ups, 5 burpees, 1 hard 10-second sprint'],
    levels: {
      beginner: { minutes: 10, scheme: '4 rounds for time', moves: [['Bike 6 calories', 'air-bike'], ['6 box step-ups, 12 in', 'box-step-up'], ['4 step-back burpees', 'burpee']] },
      intermediate: { minutes: 10, scheme: '5 rounds for time', moves: [['Bike 10 calories', 'air-bike'], ['8 box jumps, 20 in', 'box-jump'], ['6 burpees', 'burpee']] },
      advanced: { minutes: 10, scheme: '5 rounds for time', moves: [['Bike 12/15 calories', 'air-bike'], ['10 box jumps, 20/24 in', 'box-jump'], ['8 burpees', 'burpee']] } } },

  { id: 'run-sandwich', name: 'Run Sandwich', format: 'for_time', equipment: ['wallball', 'none'],
    about: 'Run, a big set of wall balls, run again. The second run is where the work shows up. Expect 15 to 22 minutes.',
    warmup: ['400 m easy jog', '10 air squats, 10 wall-ball shots with a light ball, leg swings'],
    levels: {
      beginner: { minutes: 22, scheme: 'For time', moves: [['Run or walk 600 m', 'run'], ['30 wall-ball shots, {6/10} ball', 'wall-ball'], ['Run or walk 600 m', 'run']] },
      intermediate: { minutes: 25, scheme: 'For time', moves: [['Run 1,000 m', 'run'], ['45 wall-ball shots, {10/14} ball', 'wall-ball'], ['Run 1,000 m', 'run']] },
      advanced: { minutes: 25, scheme: 'For time', moves: [['Run 1,200 m', 'run'], ['60 wall-ball shots, {14/20} ball', 'wall-ball'], ['Run 1,200 m', 'run']] } } },

  { id: 'dumbbell-flow', name: 'Dumbbell Flow', format: 'amrap', equipment: ['dumbbell'],
    about: 'One pair of dumbbells, no setting them down if you can help it. Smooth, steady and repeatable. Good for a home gym.',
    warmup: ['2 minutes of jumping jacks', '2 rounds with light dumbbells: 5 deadlifts, 5 hang cleans, 5 front squats, 5 presses'],
    levels: {
      beginner: { minutes: 12, scheme: 'AMRAP', moves: [['6 dumbbell hang cleans, {10/15}', 'dumbbell-hang-clean'], ['6 goblet squats', 'goblet-squat'], ['6 dumbbell shoulder presses', 'dumbbell-shoulder-press'], ['4 step-back burpees', 'burpee']] },
      intermediate: { minutes: 16, scheme: 'AMRAP', moves: [['8 dumbbell hang cleans, {20/35}', 'dumbbell-hang-clean'], ['8 dumbbell front squats', 'goblet-squat'], ['8 dumbbell push presses', 'push-press'], ['6 burpees', 'burpee']] },
      advanced: { minutes: 16, scheme: 'AMRAP', moves: [['8 dumbbell hang cleans, {35/50}', 'dumbbell-hang-clean'], ['8 dumbbell front squats', 'goblet-squat'], ['8 dumbbell push jerks', 'push-press'], ['8 burpees over the dumbbells', 'burpee']] } } },

  { id: 'travel-day', name: 'Travel Day', format: 'for_time', equipment: ['none'],
    about: 'No equipment, just a little floor and somewhere to run. Good for a hotel or a park. Expect 15 to 22 minutes.',
    warmup: ['400 m easy jog', '10 air squats, 10 lunges, 5 inchworms, 5 push-ups'],
    levels: {
      beginner: { minutes: 22, scheme: '4 rounds for time', moves: [['Walk or jog 200 m', 'run'], ['12 walking lunges', 'dumbbell-walking-lunge'], ['8 incline push-ups', 'incline-push-up'], ['5 broad jumps or squat jumps', 'broad-jump']] },
      intermediate: { minutes: 25, scheme: '5 rounds for time', moves: [['Run 200 m', 'run'], ['20 walking lunges', 'dumbbell-walking-lunge'], ['12 push-ups', 'push-up'], ['8 broad jumps', 'broad-jump']] },
      advanced: { minutes: 25, scheme: '5 rounds for time', moves: [['Run 400 m', 'run'], ['20 walking lunges', 'dumbbell-walking-lunge'], ['15 push-ups', 'push-up'], ['10 broad jumps', 'broad-jump']] } } },

  { id: 'bell-carousel', name: 'Bell Carousel', format: 'emom', equipment: ['kettlebell', 'none'],
    about: 'Five stations, one per minute, round and round. The last minute is rest. Score: minutes finished in time.',
    warmup: ['2 minutes easy cardio', '10 kettlebell deadlifts, 10 swings, 5 goblet squats, 5 burpees'],
    levels: {
      beginner: { minutes: 15, scheme: 'Every minute, five stations', moves: [['Minute 1: 10 kettlebell deadlifts, {18/26}', 'kettlebell-swing'], ['Minute 2: 8 kettlebell goblet squats', 'kettlebell-goblet-squat'], ['Minute 3: 10 sit-ups', 'sit-up'], ['Minute 4: 4 step-back burpees', 'burpee'], ['Minute 5: rest']] },
      intermediate: { minutes: 20, scheme: 'Every minute, five stations', moves: [['Minute 1: 15 kettlebell swings, {26/35}', 'kettlebell-swing'], ['Minute 2: 12 kettlebell goblet squats', 'kettlebell-goblet-squat'], ['Minute 3: 15 sit-ups', 'sit-up'], ['Minute 4: 8 burpees', 'burpee'], ['Minute 5: rest']] },
      advanced: { minutes: 25, scheme: 'Every minute, five stations', moves: [['Minute 1: 20 kettlebell swings, {35/53}', 'kettlebell-swing'], ['Minute 2: 15 kettlebell goblet squats', 'kettlebell-goblet-squat'], ['Minute 3: 20 sit-ups', 'sit-up'], ['Minute 4: 12 burpees', 'burpee'], ['Minute 5: rest']] } } },

  { id: 'barbell-trio', name: 'Barbell Trio', format: 'for_time', equipment: ['barbell'],
    about: 'One bar, three lifts, light enough to keep cycling. Fewer reps per lift as you move up the body. Expect 8 to 12 minutes.',
    warmup: ['3 minutes easy cardio', 'With an empty bar, 2 rounds: 5 deadlifts, 5 hang power cleans, 5 push presses'],
    levels: {
      beginner: { minutes: 15, scheme: '3 rounds for time', moves: [['10 deadlifts, {45/65}', 'conventional-deadlift'], ['8 dumbbell hang cleans, {15/20}', 'dumbbell-hang-clean'], ['6 dumbbell shoulder presses, {15/20}', 'dumbbell-shoulder-press']] },
      intermediate: { minutes: 15, scheme: '3 rounds for time', moves: [['12 deadlifts, {95/135}', 'conventional-deadlift'], ['9 power cleans', 'barbell-power-clean'], ['6 push presses', 'push-press']] },
      advanced: { minutes: 15, scheme: '4 rounds for time', moves: [['12 deadlifts, {135/185}', 'conventional-deadlift'], ['9 hang power cleans', 'hang-power-clean'], ['6 push jerks', 'push-jerk']] } } },

  { id: 'rope-skills', name: 'Rope Skills', format: 'amrap', equipment: ['jumprope', 'dumbbell', 'box'],
    about: 'Part A is 10 minutes of jump-rope practice, not for score. Part B puts it to work. If double-unders are new, take your time with Part A.',
    warmup: ['2 minutes easy jump rope', 'Calf raises and ankle bounces, 20 each'],
    levels: {
      beginner: { minutes: 8, scheme: 'Part B: AMRAP', strength: { scheme: 'Part A: 10 minutes of single-under practice', moves: [['Sets of 20 to 30, resting as needed. Aim for steady, quiet jumps', 'jump-rope']] },
        moves: [['40 single-unders', 'jump-rope'], ['6 dumbbell snatches each arm, {10/15}', 'dumbbell-snatch'], ['6 box step-ups, 12 in', 'box-step-up']] },
      intermediate: { minutes: 10, scheme: 'Part B: AMRAP', strength: { scheme: 'Part A: 10 minutes of double-under practice', moves: [['Try 5 attempts of a single double-under between single-unders, then string them together', 'double-under']] },
        moves: [['20 double-unders, or 60 single-unders', 'double-under'], ['8 alternating dumbbell snatches, {25/35}', 'dumbbell-snatch'], ['8 box jumps, 20 in', 'box-jump']] },
      advanced: { minutes: 10, scheme: 'Part B: AMRAP', strength: { scheme: 'Part A: 10 minutes of double-under work', moves: [['Every minute: 30 to 50 unbroken double-unders', 'double-under']] },
        moves: [['40 double-unders', 'double-under'], ['10 alternating dumbbell snatches, {35/50}', 'dumbbell-snatch'], ['10 box jumps, 20/24 in', 'box-jump']] } } },

  { id: 'upside-down', name: 'Upside Down', format: 'for_time', equipment: ['jumprope', 'none'],
    about: 'Part A builds pressing strength, every minute for 10 minutes. Part B is a fast couplet with descending reps. Expect 8 to 12 minutes in Part B.',
    warmup: ['2 minutes of jump rope', '10 shoulder taps, 10 pike push-ups from the knees, 20-second plank'],
    levels: {
      beginner: { minutes: 12, scheme: 'Part B: 40-30-20-10 reps of each', strength: { scheme: 'Part A: Every minute for 10 minutes', moves: [['3 to 5 pike push-ups, hands on a bench or box', 'pike-push-up']] },
        moves: [['Single-unders', 'jump-rope'], ['Sit-ups (half the rope count)', 'sit-up']] },
      intermediate: { minutes: 14, scheme: 'Part B: 50-40-30-20-10 reps of each', strength: { scheme: 'Part A: Every minute for 10 minutes', moves: [['4 to 6 pike push-ups, feet on a box', 'pike-push-up']] },
        moves: [['Single-unders, or half as many double-unders', 'jump-rope'], ['Sit-ups (half the rope count)', 'sit-up']] },
      advanced: { minutes: 15, scheme: 'Part B: 50-40-30-20-10 reps of each', strength: { scheme: 'Part A: Every minute for 10 minutes', moves: [['3 to 5 strict handstand push-ups', 'handstand-push-up']] },
        moves: [['Double-unders', 'double-under'], ['Sit-ups', 'sit-up']] } } },

  { id: 'row-test', name: 'Row Test', format: 'for_time', equipment: ['rower'],
    about: 'A benchmark you will come back to. Row the distance as fast as you can, pacing evenly. Write your split per 500 m in the notes, so next time you have a target.',
    warmup: ['5 minutes easy rowing', '3 pickups of 10 strokes at race pace, with a minute easy between'],
    levels: {
      beginner: { minutes: 10, scheme: 'For time', moves: [['Row 1,000 m', 'rowing-machine']] },
      intermediate: { minutes: 12, scheme: 'For time', moves: [['Row 1,500 m', 'rowing-machine']] },
      advanced: { minutes: 12, scheme: 'For time', moves: [['Row 2,000 m', 'rowing-machine']] } } },

  { id: 'burpee-test', name: 'Burpee Test', format: 'amrap', scoreType: 'reps', equipment: ['none'],
    about: 'A benchmark you will come back to. As many burpees as you can in the time. Start at a pace you can hold. Score: total reps.',
    warmup: ['3 minutes easy cardio', '10 air squats, 10 push-ups or incline push-ups, 5 slow burpees'],
    levels: {
      beginner: { minutes: 5, scheme: 'Max reps', moves: [['Step-back burpees, no push-up needed', 'burpee']] },
      intermediate: { minutes: 7, scheme: 'Max reps', moves: [['Burpees', 'burpee']] },
      advanced: { minutes: 7, scheme: 'Max reps', moves: [['Burpees, jumping to touch a target 6 in above your reach', 'burpee']] } } },

  { id: 'overhead-engine', name: 'Overhead Engine', format: 'amrap', equipment: ['barbell', 'box', 'bike'],
    about: 'Overhead squats keep you honest about position. Move the bike fast, and slow down for the squats.',
    warmup: ['3 minutes easy biking', 'With a PVC pipe or empty bar: 10 pass-throughs, 10 overhead squats, 5 slow squats with a pause at the bottom'],
    levels: {
      beginner: { minutes: 10, scheme: 'AMRAP', moves: [['6 goblet squats, {15/25}', 'goblet-squat'], ['6 box step-ups, 12 in', 'box-step-up'], ['Bike 6 calories', 'air-bike']] },
      intermediate: { minutes: 12, scheme: 'AMRAP', moves: [['6 overhead squats, {45/65}', 'overhead-squat'], ['9 box jumps, 20 in', 'box-jump'], ['Bike 10 calories', 'air-bike']] },
      advanced: { minutes: 14, scheme: 'AMRAP', moves: [['8 overhead squats, {65/95}', 'overhead-squat'], ['10 box jumps, 20/24 in', 'box-jump'], ['Bike 12/15 calories', 'air-bike']] } } },

  /* ---------- The original set ----------
     Retired from the daily rotation but kept, so old results still open and the workouts stay in the list.
     A level here is [minutes, scheme, moves]. */
  { id: 'first-gear', retired: true, name: 'First Gear', format: 'for_time', equipment: ['none'], about: 'Steady full-body work with no equipment.', levels: {
    beginner: [12, '3 rounds', [['10 bodyweight squats', 'bodyweight-squat'], ['8 incline push-ups', 'incline-push-up'], ['Walk 200 m']]],
    intermediate: [15, '4 rounds', [['15 bodyweight squats', 'bodyweight-squat'], ['10 push-ups', 'push-up'], ['Run 200 m']]],
    advanced: [18, '5 rounds', [['25 bodyweight squats', 'bodyweight-squat'], ['20 push-ups', 'push-up'], ['Run 400 m']]] } },
  { id: 'swing-shift', retired: true, name: 'Swing Shift', format: 'amrap', equipment: ['kettlebell'], about: 'Hips and core, at a pace you can hold.', levels: {
    beginner: [8, 'As many rounds as you can', [['8 kettlebell deadlifts or light swings, light weight', 'kettlebell-swing'], ['8 glute bridges', 'glute-bridge'], ['20-second plank', 'plank']]],
    intermediate: [12, 'As many rounds as you can', [['15 kettlebell swings, 35 lb / 16 kg', 'kettlebell-swing'], ['10 push-ups', 'push-up'], ['15 bodyweight squats', 'bodyweight-squat']]],
    advanced: [15, 'As many rounds as you can', [['20 kettlebell swings, 53 lb / 24 kg', 'kettlebell-swing'], ['15 push-ups', 'push-up'], ['20 walking lunges, bodyweight', 'dumbbell-walking-lunge']]] } },
  { id: 'minute-man', retired: true, name: 'Minute Man', format: 'emom', equipment: ['none'], about: 'Do the work at the start of each minute, and rest for what is left.', levels: {
    beginner: [8, 'Every minute, alternating', [['Odd minutes: 6 incline push-ups', 'incline-push-up'], ['Even minutes: 8 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [12, 'Every minute, alternating', [['Odd minutes: 10 push-ups', 'push-up'], ['Even minutes: 15 bodyweight squats', 'bodyweight-squat']]],
    advanced: [16, 'Every minute, alternating', [['Odd minutes: 8 burpees', 'burpee'], ['Even minutes: 20 bodyweight squats', 'bodyweight-squat']]] } },
  { id: 'dumbbell-ladder', retired: true, name: 'Dumbbell Ladder', format: 'for_time', equipment: ['dumbbell'], about: 'Reps drop each round, so the end gets quicker.', levels: {
    beginner: [12, '12-9-6 reps of each, light dumbbells', [['Goblet squat', 'goblet-squat'], ['Dumbbell shoulder press', 'dumbbell-shoulder-press'], ['One-arm dumbbell row, each side', 'dumbbell-row']]],
    intermediate: [15, '21-15-9 reps of each, 25 lb / 10 kg', [['Goblet squat', 'goblet-squat'], ['Dumbbell shoulder press', 'dumbbell-shoulder-press'], ['One-arm dumbbell row, total reps', 'dumbbell-row']]],
    advanced: [15, '21-15-9 reps of each, 45 lb / 20 kg', [['Dumbbell thruster', 'dumbbell-thruster'], ['One-arm dumbbell row, total reps', 'dumbbell-row'], ['Burpee', 'burpee']]] } },
  { id: 'row-and-reset', retired: true, name: 'Row and Reset', format: 'for_time', equipment: ['rower'], about: 'Rowing paired with simple bodyweight moves.', levels: {
    beginner: [14, '3 rounds', [['Row 250 m, easy pace', 'rowing-machine'], ['8 incline push-ups', 'incline-push-up'], ['10 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [18, '4 rounds', [['Row 300 m', 'rowing-machine'], ['12 push-ups', 'push-up'], ['15 bodyweight squats', 'bodyweight-squat']]],
    advanced: [22, '5 rounds', [['Row 500 m', 'rowing-machine'], ['15 push-ups', 'push-up'], ['15 burpees', 'burpee']]] } },
  { id: 'core-clock', retired: true, name: 'Core Clock', format: 'amrap', equipment: ['none'], about: 'Midsection work. Keep your back still rather than chasing speed.', levels: {
    beginner: [6, 'As many rounds as you can', [['6 dead bugs, each side', 'dead-bug'], ['6 bird dogs, each side', 'bird-dog'], ['20-second plank', 'plank']]],
    intermediate: [10, 'As many rounds as you can', [['15 crunches', 'crunch'], ['10 lying leg raises', 'lying-leg-raise'], ['30 mountain climbers', 'mountain-climber']]],
    advanced: [12, 'As many rounds as you can', [['10 hanging leg raises', 'hanging-leg-raise'], ['20 Russian twists', 'russian-twist'], ['40 mountain climbers', 'mountain-climber'], ['10 burpees', 'burpee']]] } },
  { id: 'clean-slate', retired: true, name: 'Clean Slate', format: 'for_time', equipment: ['barbell'], about: 'Barbell skill work. Good technique comes first, and the clock second.', levels: {
    beginner: [12, '3 rounds, empty bar or light dumbbells', [['8 Romanian deadlifts', 'romanian-deadlift'], ['8 overhead presses', 'overhead-press'], ['10 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [15, '5 rounds, 95 lb / 40 kg', [['5 power cleans', 'barbell-power-clean'], ['10 front squats', 'barbell-front-squat'], ['10 push-ups', 'push-up']]],
    advanced: [15, '5 rounds, 135 lb / 60 kg', [['7 power cleans', 'barbell-power-clean'], ['7 front squats', 'barbell-front-squat'], ['7 push presses', 'push-press'], ['7 burpees', 'burpee']]] } },
  { id: 'pull-party', retired: true, name: 'Pull Party', format: 'emom', equipment: ['pullup'], about: 'Upper-body pulling, little and often.', levels: {
    beginner: [8, 'Every minute', [['5 inverted rows, feet close for an easier angle', 'inverted-row'], ['5 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [10, 'Every minute', [['4 pull-ups (or 8 inverted rows)', 'pull-up'], ['6 push-ups', 'push-up']]],
    advanced: [14, 'Every minute', [['6 pull-ups', 'pull-up'], ['8 push-ups', 'push-up'], ['8 bodyweight squats', 'bodyweight-squat']]] } },
  { id: 'farmers-market', retired: true, name: "Farmer's Market", format: 'for_time', equipment: ['dumbbell'], about: 'Loaded carries build grip and a strong trunk.', levels: {
    beginner: [12, '3 rounds', [['Carry light dumbbells 30 m', 'farmers-carry'], ['8 goblet squats, light', 'goblet-squat'], ['20-second plank', 'plank']]],
    intermediate: [15, '4 rounds', [['Carry 40 lb / 18 kg dumbbells 40 m', 'farmers-carry'], ['10 goblet squats, 40 lb / 18 kg', 'goblet-squat'], ['10 push-ups', 'push-up']]],
    advanced: [18, '5 rounds', [['Carry 60 lb / 27 kg dumbbells 50 m', 'farmers-carry'], ['12 dumbbell thrusters, 35 lb / 15 kg', 'dumbbell-thruster'], ['10 burpees', 'burpee']]] } },
  { id: 'step-it-up', retired: true, name: 'Step It Up', format: 'amrap', equipment: ['dumbbell'], about: 'Single-leg work. Step onto a low, stable box or bench.', levels: {
    beginner: [8, 'As many rounds as you can', [['6 step-ups each leg, no weight', 'dumbbell-step-up'], ['8 incline push-ups', 'incline-push-up']]],
    intermediate: [12, 'As many rounds as you can', [['8 step-ups each leg, 20 lb / 10 kg', 'dumbbell-step-up'], ['10 dumbbell shoulder presses, 20 lb / 10 kg', 'dumbbell-shoulder-press'], ['10 crunches', 'crunch']]],
    advanced: [15, 'As many rounds as you can', [['10 step-ups each leg, 40 lb / 18 kg', 'dumbbell-step-up'], ['10 dumbbell thrusters, 40 lb / 18 kg', 'dumbbell-thruster'], ['10 burpees', 'burpee']]] } },
  { id: 'deadlift-dash', retired: true, name: 'Deadlift Dash', format: 'for_time', equipment: ['barbell'], about: 'Keep your back flat. Stop the set if it starts to round.', levels: {
    beginner: [12, '3 rounds', [['8 kettlebell or dumbbell deadlifts, light', 'dumbbell-romanian-deadlift'], ['Walk 200 m'], ['10-second dead hang or plank', 'plank']]],
    intermediate: [15, '5 rounds', [['8 deadlifts, 135 lb / 60 kg', 'conventional-deadlift'], ['Run 200 m'], ['10 push-ups', 'push-up']]],
    advanced: [18, '5 rounds', [['10 deadlifts, 225 lb / 100 kg', 'conventional-deadlift'], ['Run 400 m'], ['10 pull-ups', 'pull-up']]] } },
  { id: 'lunge-line', retired: true, name: 'Lunge Line', format: 'emom', equipment: ['none'], about: 'Legs and balance. Step back rather than forward if your knees prefer it.', levels: {
    beginner: [8, 'Every minute', [['4 reverse lunges each leg, bodyweight', 'dumbbell-reverse-lunge'], ['10-second wall sit', 'wall-sit']]],
    intermediate: [10, 'Every minute', [['6 walking lunges each leg, bodyweight', 'dumbbell-walking-lunge'], ['5 push-ups', 'push-up']]],
    advanced: [14, 'Every minute', [['8 walking lunges each leg, holding 25 lb / 10 kg dumbbells', 'dumbbell-walking-lunge'], ['5 burpees', 'burpee']]] } },
  { id: 'thruster-town', retired: true, name: 'Thruster Town', format: 'for_time', equipment: ['dumbbell'], about: 'A squat into a press. It builds heat quickly, so start slower than you think.', levels: {
    beginner: [10, '12-9-6 reps of each', [['Goblet squat, light', 'goblet-squat'], ['Incline push-up', 'incline-push-up']]],
    intermediate: [12, '21-15-9 reps of each', [['Dumbbell thruster, 20 lb / 10 kg', 'dumbbell-thruster'], ['Push-up', 'push-up']]],
    advanced: [12, '21-15-9 reps of each', [['Barbell thruster, 95 lb / 40 kg', 'barbell-thruster'], ['Pull-up', 'pull-up']]] } },
  { id: 'kettle-corn', retired: true, name: 'Kettle Corn', format: 'amrap', equipment: ['kettlebell'], about: 'Mixed kettlebell work for the whole body.', levels: {
    beginner: [8, 'As many rounds as you can', [['6 kettlebell goblet squats, light', 'kettlebell-goblet-squat'], ['6 kettlebell rows each side, light', 'kettlebell-row'], ['8 glute bridges', 'glute-bridge']]],
    intermediate: [12, 'As many rounds as you can', [['10 kettlebell goblet squats, 35 lb / 16 kg', 'kettlebell-goblet-squat'], ['8 kettlebell rows each side', 'kettlebell-row'], ['12 kettlebell swings', 'kettlebell-swing']]],
    advanced: [15, 'As many rounds as you can', [['5 clean and presses each side, 44 lb / 20 kg', 'kettlebell-clean-and-press'], ['15 kettlebell swings', 'kettlebell-swing'], ['10 burpees', 'burpee']]] } },
  { id: 'burpee-bakery', retired: true, name: 'Burpee Bakery', format: 'emom', equipment: ['none'], about: 'Beginners step rather than jump. Everyone rests for what is left of the minute.', levels: {
    beginner: [6, 'Every minute', [['4 step-back burpees, no jump or push-up', 'burpee']]],
    intermediate: [10, 'Every minute', [['6 burpees', 'burpee'], ['6 bodyweight squats', 'bodyweight-squat']]],
    advanced: [12, 'Every minute', [['10 burpees', 'burpee'], ['5 push-ups', 'push-up']]] } },
  { id: 'long-walk', retired: true, name: 'The Long Walk', format: 'for_time', equipment: ['none'], about: 'A longer, easier effort. You should be able to talk the whole way.', levels: {
    beginner: [25, '1 round', [['Walk 800 m'], ['20 bodyweight squats, in as many sets as you like', 'bodyweight-squat'], ['Walk 800 m']]],
    intermediate: [30, '1 round', [['Run 800 m'], ['50 bodyweight squats', 'bodyweight-squat'], ['30 push-ups', 'push-up'], ['Run 800 m']]],
    advanced: [35, '1 round', [['Run 1,600 m'], ['100 bodyweight squats', 'bodyweight-squat'], ['50 push-ups', 'push-up'], ['Run 1,600 m']]] } },
  { id: 'press-pass', retired: true, name: 'Press Pass', format: 'amrap', equipment: ['dumbbell'], about: 'Shoulders and legs. Keep your ribs down as you press.', levels: {
    beginner: [8, 'As many rounds as you can', [['6 dumbbell shoulder presses, light', 'dumbbell-shoulder-press'], ['8 bodyweight squats', 'bodyweight-squat'], ['6 dumbbell rows each side, light', 'dumbbell-row']]],
    intermediate: [12, 'As many rounds as you can', [['8 dumbbell shoulder presses, 30 lb / 12.5 kg', 'dumbbell-shoulder-press'], ['12 goblet squats, 30 lb / 12.5 kg', 'goblet-squat'], ['10 push-ups', 'push-up']]],
    advanced: [15, 'As many rounds as you can', [['10 Arnold presses, 40 lb / 18 kg', 'arnold-press'], ['15 goblet squats, 50 lb / 22.5 kg', 'goblet-squat'], ['10 pull-ups', 'pull-up']]] } },
  { id: 'squat-stack', retired: true, name: 'Squat Stack', format: 'for_time', equipment: ['barbell'], about: 'Leg strength under a time cap. Use the rack safeties for barbell squats.', levels: {
    beginner: [12, '3 rounds', [['10 goblet squats, light', 'goblet-squat'], ['10 glute bridges', 'glute-bridge'], ['20-second plank', 'plank']]],
    intermediate: [15, '4 rounds, 95 lb / 40 kg', [['10 back squats', 'barbell-back-squat'], ['10 Romanian deadlifts', 'romanian-deadlift'], ['Run 200 m']]],
    advanced: [18, '5 rounds, 155 lb / 70 kg', [['10 back squats', 'barbell-back-squat'], ['10 Romanian deadlifts', 'romanian-deadlift'], ['10 burpees', 'burpee']]] } },
  { id: 'rope-a-dope', retired: true, name: 'Rope-a-Dope', format: 'emom', equipment: ['other'], about: 'Battle ropes for conditioning. A rower works too if you have no rope.', levels: {
    beginner: [8, 'Every minute', [['15 seconds of rope waves', 'battle-rope-waves'], ['5 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [10, 'Every minute', [['25 seconds of rope waves', 'battle-rope-waves'], ['6 push-ups', 'push-up']]],
    advanced: [14, 'Every minute', [['30 seconds of rope waves', 'battle-rope-waves'], ['6 burpees', 'burpee']]] } },
  { id: 'backyard-basics', retired: true, name: 'Backyard Basics', format: 'amrap', equipment: ['none'], about: 'No gym needed. Only a little floor space.', levels: {
    beginner: [10, 'As many rounds as you can', [['8 bodyweight squats', 'bodyweight-squat'], ['6 incline push-ups', 'incline-push-up'], ['8 glute bridges', 'glute-bridge'], ['20 mountain climbers, slowly', 'mountain-climber']]],
    intermediate: [14, 'As many rounds as you can', [['15 bodyweight squats', 'bodyweight-squat'], ['12 push-ups', 'push-up'], ['10 single-leg glute bridges each side', 'single-leg-glute-bridge'], ['30 mountain climbers', 'mountain-climber']]],
    advanced: [18, 'As many rounds as you can', [['25 bodyweight squats', 'bodyweight-squat'], ['15 decline push-ups', 'decline-push-up'], ['12 single-leg glute bridges each side', 'single-leg-glute-bridge'], ['12 burpees', 'burpee']]] } },
  { id: 'row-ladder', retired: true, name: 'Row Ladder', format: 'for_time', equipment: ['rower'], about: 'The distance shrinks each round. Keep your strokes long.', levels: {
    beginner: [14, '300-200-100 m', [['Row the distance, easy pace', 'rowing-machine'], ['After each row: 10 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [16, '500-400-300-200-100 m', [['Row the distance', 'rowing-machine'], ['After each row: 10 push-ups', 'push-up']]],
    advanced: [20, '1,000-750-500-250 m', [['Row the distance', 'rowing-machine'], ['After each row: 15 burpees', 'burpee']]] } },
  { id: 'iron-minute', retired: true, name: 'Iron Minute', format: 'emom', equipment: ['barbell'], about: 'Low reps with a moderate weight. Choose a load you could lift many more times.', levels: {
    beginner: [8, 'Every minute, empty bar or light dumbbells', [['Odd minutes: 5 overhead presses', 'overhead-press'], ['Even minutes: 5 Romanian deadlifts', 'romanian-deadlift']]],
    intermediate: [10, 'Every minute, 95 lb / 40 kg', [['Odd minutes: 5 front squats', 'barbell-front-squat'], ['Even minutes: 5 push presses', 'push-press']]],
    advanced: [12, 'Every minute, 135 lb / 60 kg', [['Odd minutes: 3 power cleans', 'barbell-power-clean'], ['Even minutes: 5 thrusters', 'barbell-thruster']]] } },
  { id: 'hang-tough', retired: true, name: 'Hang Tough', format: 'for_time', equipment: ['pullup'], about: 'Grip and midsection. Lower yourself from the bar slowly rather than dropping.', levels: {
    beginner: [10, '3 rounds', [['10-second dead hang', 'dead-hang'], ['6 inverted rows', 'inverted-row'], ['8 crunches', 'crunch']]],
    intermediate: [14, '4 rounds', [['8 hanging knee raises', 'hanging-knee-raise'], ['6 pull-ups (or 10 inverted rows)', 'pull-up'], ['12 push-ups', 'push-up']]],
    advanced: [16, '5 rounds', [['10 hanging leg raises', 'hanging-leg-raise'], ['10 chin-ups', 'chin-up'], ['15 push-ups', 'push-up']]] } },
  { id: 'sled-dog', retired: true, name: 'Sled Dog', format: 'amrap', equipment: ['other'], about: 'Sled work is hard on the legs but easy on the joints. Walking lunges can replace it.', levels: {
    beginner: [8, 'As many rounds as you can', [['Push a light sled 15 m', 'sled-push'], ['8 incline push-ups', 'incline-push-up'], ['Walk back to the start']]],
    intermediate: [12, 'As many rounds as you can', [['Push a moderate sled 20 m', 'sled-push'], ['12 push-ups', 'push-up'], ['12 kettlebell swings', 'kettlebell-swing']]],
    advanced: [15, 'As many rounds as you can', [['Push a heavy sled 20 m', 'sled-push'], ['10 burpees', 'burpee'], ['15 kettlebell swings, 53 lb / 24 kg', 'kettlebell-swing']]] } },
];

/* Swaps for a movement you can't do yet, or don't have the equipment for. Keyed by exercise id; each
   option is [exercise id, when and how to use it]. Easier options come first. */
self.PLATE_WOD_SUBS = {
  'pull-up': [['jumping-pull-up', 'Stand on a box so a small jump gets your chin over the bar, then lower slowly.'], ['inverted-row', 'Ring or bar rows. Walk your feet back to make them harder.'], ['assisted-pull-up', 'A band or assisted machine, with the same reps.'], ['band-lat-pulldown', 'No bar? A band or lat pulldown, with the same reps.']],
  'chin-up': [['jumping-pull-up', 'Jump up, then lower slowly with your palms facing you.'], ['inverted-row', 'Palms facing you, feet walked back to make it harder.'], ['assisted-pull-up', 'A band or assisted machine.']],
  'toes-to-bar': [['hanging-knee-raise', 'Same reps, bringing your knees up to your chest.'], ['lying-leg-raise', 'On the floor, if hanging is hard on your grip or shoulders.'], ['sit-up', 'Same reps, if you have no bar.']],
  'hanging-knee-raise': [['lying-leg-raise', 'On the floor, with your lower back pressed down.'], ['sit-up', 'Same reps.'], ['dead-bug', 'Slow and controlled, if sit-ups bother your back.']],
  'hanging-leg-raise': [['hanging-knee-raise', 'Bend your knees to make it easier.'], ['lying-leg-raise', 'On the floor.']],
  'handstand-push-up': [['pike-push-up', 'Feet on a box, head down between your hands. Same reps.'], ['dumbbell-shoulder-press', 'Seated or standing, a weight you can press 10 times.'], ['push-up', 'If overhead pressing hurts your shoulders.']],
  'pike-push-up': [['incline-push-up', 'Hands on a bench, if pike push-ups are too hard for now.'], ['dumbbell-shoulder-press', 'Light dumbbells, same reps.']],
  'push-up': [['incline-push-up', 'Hands on a bench or box. The higher it is, the easier.'], ['push-up', 'From your knees, keeping a straight line from knees to head.']],
  'incline-push-up': [['incline-push-up', 'Hands higher, on a counter or wall, to make it easier.'], ['plank', 'Hold a plank for the same number of seconds as reps.']],
  'burpee': [['burpee', 'Step back and step in, with no jump or push-up.'], ['mountain-climber', 'Twice the reps, if getting down to the floor is hard.'], ['bodyweight-squat', 'Same reps, with a reach overhead at the top.']],
  'double-under': [['jump-rope', 'Single-unders, 2 or 3 times the reps.'], ['jump-rope', 'No rope? Hop on the spot with the same count.']],
  'jump-rope': [['jump-rope', 'No rope? Hop on the spot with the same count.'], ['mountain-climber', 'If jumping hurts, half the reps of mountain climbers.']],
  'box-jump': [['box-step-up', 'Step up one foot at a time, and stand tall at the top.'], ['box-jump', 'Use a lower box.'], ['bodyweight-squat', 'No box? Squat jumps, or air squats if jumping hurts.']],
  'box-step-up': [['box-step-up', 'Use a lower step.'], ['dumbbell-reverse-lunge', 'No box? Reverse lunges, same reps.']],
  'wall-ball': [['wall-ball', 'A lighter ball, or a lower target.'], ['dumbbell-thruster', 'No ball? Light dumbbell thrusters.'], ['goblet-squat', 'Squat holding the ball, then press it overhead.']],
  'kettlebell-swing': [['kettlebell-swing', 'Kettlebell deadlifts: no swing, same weight, same reps.'], ['dumbbell-romanian-deadlift', 'With dumbbells, if you have no kettlebell.'], ['glute-bridge', 'No weight? Glute bridges, same reps.']],
  'barbell-power-clean': [['dumbbell-hang-clean', 'Dumbbells from the knees, same reps.'], ['hang-power-clean', 'From the hang, with a lighter bar.'], ['kettlebell-swing', 'If the clean is new, swings train the same hip drive.']],
  'hang-power-clean': [['dumbbell-hang-clean', 'Dumbbells, same reps.'], ['barbell-power-clean', 'From the floor, if the hang is awkward.'], ['kettlebell-swing', 'If cleans are new.']],
  'dumbbell-hang-clean': [['kettlebell-swing', 'Same reps, if the clean is new.'], ['dumbbell-romanian-deadlift', 'Just the pull from the knees, same reps.']],
  'power-snatch': [['hang-power-snatch', 'From the hang, lighter.'], ['dumbbell-snatch', 'One arm at a time, same total reps.']],
  'hang-power-snatch': [['dumbbell-snatch', 'One arm at a time, same total reps.'], ['kettlebell-swing', 'If overhead is uncomfortable.']],
  'dumbbell-snatch': [['dumbbell-hang-clean', 'Stop at the shoulder, then press it overhead.'], ['kettlebell-swing', 'If going overhead hurts your shoulder.']],
  'devil-press': [['dumbbell-thruster', 'Same reps, without the burpee.'], ['burpee', 'Same reps, no dumbbell.']],
  'barbell-thruster': [['dumbbell-thruster', 'Dumbbells are easier to control.'], ['goblet-squat', 'Squat, then press, as two separate parts.']],
  'dumbbell-thruster': [['goblet-squat', 'Squat only, if pressing hurts.'], ['dumbbell-thruster', 'Use one dumbbell held with both hands.']],
  'push-jerk': [['push-press', 'Lighter, without the second dip.'], ['dumbbell-shoulder-press', 'Dumbbells, a strict press.']],
  'push-press': [['dumbbell-shoulder-press', 'Strict and lighter.'], ['pike-push-up', 'No weights? Pike push-ups.']],
  'overhead-squat': [['goblet-squat', 'A dumbbell held at the chest. Same reps.'], ['barbell-front-squat', 'If your shoulders can\'t hold the bar overhead yet.']],
  'barbell-front-squat': [['goblet-squat', 'A dumbbell or kettlebell at the chest.'], ['bodyweight-squat', 'No weights? Air squats, 1.5 times the reps.']],
  'barbell-back-squat': [['goblet-squat', 'Lighter and easier to learn.'], ['leg-press', 'A machine, if a bar on your back hurts.']],
  'goblet-squat': [['bodyweight-squat', 'No weight, same reps.'], ['bodyweight-squat', 'Squat to a bench, and stand back up.']],
  'conventional-deadlift': [['trap-bar-deadlift', 'A trap bar is easier on your back.'], ['dumbbell-romanian-deadlift', 'Dumbbells, lighter.'], ['kettlebell-swing', 'Kettlebell deadlifts, if you have no bar.']],
  'sumo-deadlift-high-pull': [['sumo-deadlift', 'Leave out the pull to your chin.'], ['kettlebell-swing', 'A kettlebell, same reps.']],
  'sumo-deadlift': [['dumbbell-romanian-deadlift', 'Dumbbells.'], ['glute-bridge', 'No weight.']],
  'dumbbell-walking-lunge': [['dumbbell-reverse-lunge', 'Reverse lunges in place are easier on your knees.'], ['bodyweight-squat', 'If lunges bother your knees, the same number of squats.']],
  'dumbbell-reverse-lunge': [['box-step-up', 'Low step-ups.'], ['bodyweight-squat', 'Same reps.']],
  'broad-jump': [['bodyweight-squat', 'Squat jumps in place, or air squats if jumping hurts.'], ['dumbbell-walking-lunge', 'Twice the reps, if jumping hurts.']],
  'sit-up': [['crunch', 'A smaller range, same reps.'], ['dead-bug', 'If sit-ups bother your back.']],
  'hollow-hold': [['hollow-hold', 'Bend your knees and keep your arms by your sides.'], ['plank', 'Same time.'], ['dead-bug', 'Slow reps for the same time.']],
  'bear-crawl': [['plank', 'Hold a plank for the same time.'], ['mountain-climber', 'Slow and controlled.']],
  'kettlebell-goblet-squat': [['bodyweight-squat', 'No weight, same reps.']],
  'dumbbell-shoulder-press': [['pike-push-up', 'No weights? Pike push-ups.'], ['dumbbell-shoulder-press', 'Seated, to keep your back supported.']],
  'rowing-machine': [['air-bike', 'Same calories, or about 1 calorie for every 15 m of the distance.'], ['run', 'Run about 80% of the distance.'], ['burpee', 'No machine? 1 burpee for every 2 calories.']],
  'air-bike': [['rowing-machine', 'Same calories.'], ['run', 'About 15 m of running for each calorie.'], ['jump-rope', 'No machine? 5 single-unders for each calorie.']],
  'run': [['rowing-machine', 'Row the same distance, or 1.25 times it.'], ['air-bike', 'About 1 calorie for every 15 m.'], ['jump-rope', 'No space? 1 single-under for each metre, up to 400.']],
  'inverted-row': [['inverted-row', 'Stand more upright to make it easier.'], ['band-row', 'No rings or bar? A band, same reps.'], ['dumbbell-row', 'One arm at a time, same reps each side.']],
  'plank': [['plank', 'From your knees, keeping a straight line from knees to head.'], ['dead-bug', 'Slow reps for the same time.']],
  'rope-climb': [['inverted-row', '3 slow rows for each climb.'], ['jumping-pull-up', '3 for each climb.']],
  'wall-walk': [['bear-crawl', '10 m for each wall walk.'], ['pike-push-up', 'Hold the top of a pike for 10 seconds.']],
};
