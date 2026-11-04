/* Plate — workouts of the day. Ids are permanent: saved results refer to them, so never rename one.
   Each workout has three versions of the same idea. A level is [minutes, scheme, moves], where minutes is
   the time cap (for_time) or the length (amrap, emom), and a move is [text, optional exercise id for the how-to]. */
self.PLATE_WODS = [
  { id: 'first-gear', name: 'First Gear', format: 'for_time', equipment: ['none'], about: 'Steady full-body work with no equipment.', levels: {
    beginner: [12, '3 rounds', [['10 bodyweight squats', 'bodyweight-squat'], ['8 incline push-ups', 'incline-push-up'], ['Walk 200 m']]],
    intermediate: [15, '4 rounds', [['15 bodyweight squats', 'bodyweight-squat'], ['10 push-ups', 'push-up'], ['Run 200 m']]],
    advanced: [18, '5 rounds', [['25 bodyweight squats', 'bodyweight-squat'], ['20 push-ups', 'push-up'], ['Run 400 m']]] } },
  { id: 'swing-shift', name: 'Swing Shift', format: 'amrap', equipment: ['kettlebell'], about: 'Hips and core, at a pace you can hold.', levels: {
    beginner: [8, 'As many rounds as you can', [['8 kettlebell deadlifts or light swings, light weight', 'kettlebell-swing'], ['8 glute bridges', 'glute-bridge'], ['20-second plank', 'plank']]],
    intermediate: [12, 'As many rounds as you can', [['15 kettlebell swings, 35 lb / 16 kg', 'kettlebell-swing'], ['10 push-ups', 'push-up'], ['15 bodyweight squats', 'bodyweight-squat']]],
    advanced: [15, 'As many rounds as you can', [['20 kettlebell swings, 53 lb / 24 kg', 'kettlebell-swing'], ['15 push-ups', 'push-up'], ['20 walking lunges, bodyweight', 'dumbbell-walking-lunge']]] } },
  { id: 'minute-man', name: 'Minute Man', format: 'emom', equipment: ['none'], about: 'Do the work at the start of each minute, and rest for what is left.', levels: {
    beginner: [8, 'Every minute, alternating', [['Odd minutes: 6 incline push-ups', 'incline-push-up'], ['Even minutes: 8 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [12, 'Every minute, alternating', [['Odd minutes: 10 push-ups', 'push-up'], ['Even minutes: 15 bodyweight squats', 'bodyweight-squat']]],
    advanced: [16, 'Every minute, alternating', [['Odd minutes: 8 burpees', 'burpee'], ['Even minutes: 20 bodyweight squats', 'bodyweight-squat']]] } },
  { id: 'dumbbell-ladder', name: 'Dumbbell Ladder', format: 'for_time', equipment: ['dumbbell'], about: 'Reps drop each round, so the end gets quicker.', levels: {
    beginner: [12, '12-9-6 reps of each, light dumbbells', [['Goblet squat', 'goblet-squat'], ['Dumbbell shoulder press', 'dumbbell-shoulder-press'], ['One-arm dumbbell row, each side', 'dumbbell-row']]],
    intermediate: [15, '21-15-9 reps of each, 25 lb / 10 kg', [['Goblet squat', 'goblet-squat'], ['Dumbbell shoulder press', 'dumbbell-shoulder-press'], ['One-arm dumbbell row, total reps', 'dumbbell-row']]],
    advanced: [15, '21-15-9 reps of each, 45 lb / 20 kg', [['Dumbbell thruster', 'dumbbell-thruster'], ['One-arm dumbbell row, total reps', 'dumbbell-row'], ['Burpee', 'burpee']]] } },
  { id: 'row-and-reset', name: 'Row and Reset', format: 'for_time', equipment: ['rower'], about: 'Rowing paired with simple bodyweight moves.', levels: {
    beginner: [14, '3 rounds', [['Row 250 m, easy pace', 'rowing-machine'], ['8 incline push-ups', 'incline-push-up'], ['10 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [18, '4 rounds', [['Row 300 m', 'rowing-machine'], ['12 push-ups', 'push-up'], ['15 bodyweight squats', 'bodyweight-squat']]],
    advanced: [22, '5 rounds', [['Row 500 m', 'rowing-machine'], ['15 push-ups', 'push-up'], ['15 burpees', 'burpee']]] } },
  { id: 'core-clock', name: 'Core Clock', format: 'amrap', equipment: ['none'], about: 'Midsection work. Keep your back still rather than chasing speed.', levels: {
    beginner: [6, 'As many rounds as you can', [['6 dead bugs, each side', 'dead-bug'], ['6 bird dogs, each side', 'bird-dog'], ['20-second plank', 'plank']]],
    intermediate: [10, 'As many rounds as you can', [['15 crunches', 'crunch'], ['10 lying leg raises', 'lying-leg-raise'], ['30 mountain climbers', 'mountain-climber']]],
    advanced: [12, 'As many rounds as you can', [['10 hanging leg raises', 'hanging-leg-raise'], ['20 Russian twists', 'russian-twist'], ['40 mountain climbers', 'mountain-climber'], ['10 burpees', 'burpee']]] } },
  { id: 'clean-slate', name: 'Clean Slate', format: 'for_time', equipment: ['barbell'], about: 'Barbell skill work. Good technique comes first, and the clock second.', levels: {
    beginner: [12, '3 rounds, empty bar or light dumbbells', [['8 Romanian deadlifts', 'romanian-deadlift'], ['8 overhead presses', 'overhead-press'], ['10 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [15, '5 rounds, 95 lb / 40 kg', [['5 power cleans', 'barbell-power-clean'], ['10 front squats', 'barbell-front-squat'], ['10 push-ups', 'push-up']]],
    advanced: [15, '5 rounds, 135 lb / 60 kg', [['7 power cleans', 'barbell-power-clean'], ['7 front squats', 'barbell-front-squat'], ['7 push presses', 'push-press'], ['7 burpees', 'burpee']]] } },
  { id: 'pull-party', name: 'Pull Party', format: 'emom', equipment: ['pullup'], about: 'Upper-body pulling, little and often.', levels: {
    beginner: [8, 'Every minute', [['5 inverted rows, feet close for an easier angle', 'inverted-row'], ['5 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [10, 'Every minute', [['4 pull-ups (or 8 inverted rows)', 'pull-up'], ['6 push-ups', 'push-up']]],
    advanced: [14, 'Every minute', [['6 pull-ups', 'pull-up'], ['8 push-ups', 'push-up'], ['8 bodyweight squats', 'bodyweight-squat']]] } },
  { id: 'farmers-market', name: "Farmer's Market", format: 'for_time', equipment: ['dumbbell'], about: 'Loaded carries build grip and a strong trunk.', levels: {
    beginner: [12, '3 rounds', [['Carry light dumbbells 30 m', 'farmers-carry'], ['8 goblet squats, light', 'goblet-squat'], ['20-second plank', 'plank']]],
    intermediate: [15, '4 rounds', [['Carry 40 lb / 18 kg dumbbells 40 m', 'farmers-carry'], ['10 goblet squats, 40 lb / 18 kg', 'goblet-squat'], ['10 push-ups', 'push-up']]],
    advanced: [18, '5 rounds', [['Carry 60 lb / 27 kg dumbbells 50 m', 'farmers-carry'], ['12 dumbbell thrusters, 35 lb / 15 kg', 'dumbbell-thruster'], ['10 burpees', 'burpee']]] } },
  { id: 'step-it-up', name: 'Step It Up', format: 'amrap', equipment: ['dumbbell'], about: 'Single-leg work. Step onto a low, stable box or bench.', levels: {
    beginner: [8, 'As many rounds as you can', [['6 step-ups each leg, no weight', 'dumbbell-step-up'], ['8 incline push-ups', 'incline-push-up']]],
    intermediate: [12, 'As many rounds as you can', [['8 step-ups each leg, 20 lb / 10 kg', 'dumbbell-step-up'], ['10 dumbbell shoulder presses, 20 lb / 10 kg', 'dumbbell-shoulder-press'], ['10 crunches', 'crunch']]],
    advanced: [15, 'As many rounds as you can', [['10 step-ups each leg, 40 lb / 18 kg', 'dumbbell-step-up'], ['10 dumbbell thrusters, 40 lb / 18 kg', 'dumbbell-thruster'], ['10 burpees', 'burpee']]] } },
  { id: 'deadlift-dash', name: 'Deadlift Dash', format: 'for_time', equipment: ['barbell'], about: 'Keep your back flat. Stop the set if it starts to round.', levels: {
    beginner: [12, '3 rounds', [['8 kettlebell or dumbbell deadlifts, light', 'dumbbell-romanian-deadlift'], ['Walk 200 m'], ['10-second dead hang or plank', 'plank']]],
    intermediate: [15, '5 rounds', [['8 deadlifts, 135 lb / 60 kg', 'conventional-deadlift'], ['Run 200 m'], ['10 push-ups', 'push-up']]],
    advanced: [18, '5 rounds', [['10 deadlifts, 225 lb / 100 kg', 'conventional-deadlift'], ['Run 400 m'], ['10 pull-ups', 'pull-up']]] } },
  { id: 'lunge-line', name: 'Lunge Line', format: 'emom', equipment: ['none'], about: 'Legs and balance. Step back rather than forward if your knees prefer it.', levels: {
    beginner: [8, 'Every minute', [['4 reverse lunges each leg, bodyweight', 'dumbbell-reverse-lunge'], ['10-second wall sit', 'wall-sit']]],
    intermediate: [10, 'Every minute', [['6 walking lunges each leg, bodyweight', 'dumbbell-walking-lunge'], ['5 push-ups', 'push-up']]],
    advanced: [14, 'Every minute', [['8 walking lunges each leg, holding 25 lb / 10 kg dumbbells', 'dumbbell-walking-lunge'], ['5 burpees', 'burpee']]] } },
  { id: 'thruster-town', name: 'Thruster Town', format: 'for_time', equipment: ['dumbbell'], about: 'A squat into a press. It builds heat quickly, so start slower than you think.', levels: {
    beginner: [10, '12-9-6 reps of each', [['Goblet squat, light', 'goblet-squat'], ['Incline push-up', 'incline-push-up']]],
    intermediate: [12, '21-15-9 reps of each', [['Dumbbell thruster, 20 lb / 10 kg', 'dumbbell-thruster'], ['Push-up', 'push-up']]],
    advanced: [12, '21-15-9 reps of each', [['Barbell thruster, 95 lb / 40 kg', 'barbell-thruster'], ['Pull-up', 'pull-up']]] } },
  { id: 'kettle-corn', name: 'Kettle Corn', format: 'amrap', equipment: ['kettlebell'], about: 'Mixed kettlebell work for the whole body.', levels: {
    beginner: [8, 'As many rounds as you can', [['6 kettlebell goblet squats, light', 'kettlebell-goblet-squat'], ['6 kettlebell rows each side, light', 'kettlebell-row'], ['8 glute bridges', 'glute-bridge']]],
    intermediate: [12, 'As many rounds as you can', [['10 kettlebell goblet squats, 35 lb / 16 kg', 'kettlebell-goblet-squat'], ['8 kettlebell rows each side', 'kettlebell-row'], ['12 kettlebell swings', 'kettlebell-swing']]],
    advanced: [15, 'As many rounds as you can', [['5 clean and presses each side, 44 lb / 20 kg', 'kettlebell-clean-and-press'], ['15 kettlebell swings', 'kettlebell-swing'], ['10 burpees', 'burpee']]] } },
  { id: 'burpee-bakery', name: 'Burpee Bakery', format: 'emom', equipment: ['none'], about: 'Beginners step rather than jump. Everyone rests for what is left of the minute.', levels: {
    beginner: [6, 'Every minute', [['4 step-back burpees, no jump or push-up', 'burpee']]],
    intermediate: [10, 'Every minute', [['6 burpees', 'burpee'], ['6 bodyweight squats', 'bodyweight-squat']]],
    advanced: [12, 'Every minute', [['10 burpees', 'burpee'], ['5 push-ups', 'push-up']]] } },
  { id: 'long-walk', name: 'The Long Walk', format: 'for_time', equipment: ['none'], about: 'A longer, easier effort. You should be able to talk the whole way.', levels: {
    beginner: [25, '1 round', [['Walk 800 m'], ['20 bodyweight squats, in as many sets as you like', 'bodyweight-squat'], ['Walk 800 m']]],
    intermediate: [30, '1 round', [['Run 800 m'], ['50 bodyweight squats', 'bodyweight-squat'], ['30 push-ups', 'push-up'], ['Run 800 m']]],
    advanced: [35, '1 round', [['Run 1,600 m'], ['100 bodyweight squats', 'bodyweight-squat'], ['50 push-ups', 'push-up'], ['Run 1,600 m']]] } },
  { id: 'press-pass', name: 'Press Pass', format: 'amrap', equipment: ['dumbbell'], about: 'Shoulders and legs. Keep your ribs down as you press.', levels: {
    beginner: [8, 'As many rounds as you can', [['6 dumbbell shoulder presses, light', 'dumbbell-shoulder-press'], ['8 bodyweight squats', 'bodyweight-squat'], ['6 dumbbell rows each side, light', 'dumbbell-row']]],
    intermediate: [12, 'As many rounds as you can', [['8 dumbbell shoulder presses, 30 lb / 12.5 kg', 'dumbbell-shoulder-press'], ['12 goblet squats, 30 lb / 12.5 kg', 'goblet-squat'], ['10 push-ups', 'push-up']]],
    advanced: [15, 'As many rounds as you can', [['10 Arnold presses, 40 lb / 18 kg', 'arnold-press'], ['15 goblet squats, 50 lb / 22.5 kg', 'goblet-squat'], ['10 pull-ups', 'pull-up']]] } },
  { id: 'squat-stack', name: 'Squat Stack', format: 'for_time', equipment: ['barbell'], about: 'Leg strength under a time cap. Use the rack safeties for barbell squats.', levels: {
    beginner: [12, '3 rounds', [['10 goblet squats, light', 'goblet-squat'], ['10 glute bridges', 'glute-bridge'], ['20-second plank', 'plank']]],
    intermediate: [15, '4 rounds, 95 lb / 40 kg', [['10 back squats', 'barbell-back-squat'], ['10 Romanian deadlifts', 'romanian-deadlift'], ['Run 200 m']]],
    advanced: [18, '5 rounds, 155 lb / 70 kg', [['10 back squats', 'barbell-back-squat'], ['10 Romanian deadlifts', 'romanian-deadlift'], ['10 burpees', 'burpee']]] } },
  { id: 'rope-a-dope', name: 'Rope-a-Dope', format: 'emom', equipment: ['other'], about: 'Battle ropes for conditioning. A rower works too if you have no rope.', levels: {
    beginner: [8, 'Every minute', [['15 seconds of rope waves', 'battle-rope-waves'], ['5 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [10, 'Every minute', [['25 seconds of rope waves', 'battle-rope-waves'], ['6 push-ups', 'push-up']]],
    advanced: [14, 'Every minute', [['30 seconds of rope waves', 'battle-rope-waves'], ['6 burpees', 'burpee']]] } },
  { id: 'backyard-basics', name: 'Backyard Basics', format: 'amrap', equipment: ['none'], about: 'No gym needed. Only a little floor space.', levels: {
    beginner: [10, 'As many rounds as you can', [['8 bodyweight squats', 'bodyweight-squat'], ['6 incline push-ups', 'incline-push-up'], ['8 glute bridges', 'glute-bridge'], ['20 mountain climbers, slowly', 'mountain-climber']]],
    intermediate: [14, 'As many rounds as you can', [['15 bodyweight squats', 'bodyweight-squat'], ['12 push-ups', 'push-up'], ['10 single-leg glute bridges each side', 'single-leg-glute-bridge'], ['30 mountain climbers', 'mountain-climber']]],
    advanced: [18, 'As many rounds as you can', [['25 bodyweight squats', 'bodyweight-squat'], ['15 decline push-ups', 'decline-push-up'], ['12 single-leg glute bridges each side', 'single-leg-glute-bridge'], ['12 burpees', 'burpee']]] } },
  { id: 'row-ladder', name: 'Row Ladder', format: 'for_time', equipment: ['rower'], about: 'The distance shrinks each round. Keep your strokes long.', levels: {
    beginner: [14, '300-200-100 m', [['Row the distance, easy pace', 'rowing-machine'], ['After each row: 10 bodyweight squats', 'bodyweight-squat']]],
    intermediate: [16, '500-400-300-200-100 m', [['Row the distance', 'rowing-machine'], ['After each row: 10 push-ups', 'push-up']]],
    advanced: [20, '1,000-750-500-250 m', [['Row the distance', 'rowing-machine'], ['After each row: 15 burpees', 'burpee']]] } },
  { id: 'iron-minute', name: 'Iron Minute', format: 'emom', equipment: ['barbell'], about: 'Low reps with a moderate weight. Choose a load you could lift many more times.', levels: {
    beginner: [8, 'Every minute, empty bar or light dumbbells', [['Odd minutes: 5 overhead presses', 'overhead-press'], ['Even minutes: 5 Romanian deadlifts', 'romanian-deadlift']]],
    intermediate: [10, 'Every minute, 95 lb / 40 kg', [['Odd minutes: 5 front squats', 'barbell-front-squat'], ['Even minutes: 5 push presses', 'push-press']]],
    advanced: [12, 'Every minute, 135 lb / 60 kg', [['Odd minutes: 3 power cleans', 'barbell-power-clean'], ['Even minutes: 5 thrusters', 'barbell-thruster']]] } },
  { id: 'hang-tough', name: 'Hang Tough', format: 'for_time', equipment: ['pullup'], about: 'Grip and midsection. Lower yourself from the bar slowly rather than dropping.', levels: {
    beginner: [10, '3 rounds', [['10-second dead hang', 'dead-hang'], ['6 inverted rows', 'inverted-row'], ['8 crunches', 'crunch']]],
    intermediate: [14, '4 rounds', [['8 hanging knee raises', 'hanging-knee-raise'], ['6 pull-ups (or 10 inverted rows)', 'pull-up'], ['12 push-ups', 'push-up']]],
    advanced: [16, '5 rounds', [['10 hanging leg raises', 'hanging-leg-raise'], ['10 chin-ups', 'chin-up'], ['15 push-ups', 'push-up']]] } },
  { id: 'sled-dog', name: 'Sled Dog', format: 'amrap', equipment: ['other'], about: 'Sled work is hard on the legs but easy on the joints. Walking lunges can replace it.', levels: {
    beginner: [8, 'As many rounds as you can', [['Push a light sled 15 m', 'sled-push'], ['8 incline push-ups', 'incline-push-up'], ['Walk back to the start']]],
    intermediate: [12, 'As many rounds as you can', [['Push a moderate sled 20 m', 'sled-push'], ['12 push-ups', 'push-up'], ['12 kettlebell swings', 'kettlebell-swing']]],
    advanced: [15, 'As many rounds as you can', [['Push a heavy sled 20 m', 'sled-push'], ['10 burpees', 'burpee'], ['15 kettlebell swings, 53 lb / 24 kg', 'kettlebell-swing']]] } },
];
