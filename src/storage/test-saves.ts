/**
 * A save exactly as the released app (main after Plan 4) writes it: schema version 1,
 * daily progress present, no starthand data. Used to prove that old saves load and are written back unchanged.
 */
export const TODAY_SAVE =
  '{"schemaVersion":1,"profile":{"xp":1840,"combo":3,"soundOn":false},'
  + '"days":{"2026-10-11":21,"2026-10-12":24,"2026-10-13":6},'
  + '"decisions":['
  + '{"ts":1760371200000,"dateKey":"2026-10-13","mode":"training","spot":{"kind":"open","position":"BTN","stack":10,"hand":5},'
  + '"chosen":"shove","verdict":"correct","responseMs":1800},'
  + '{"ts":1760371260000,"dateKey":"2026-10-13","mode":"daily","spot":{"kind":"call","shover":"SB","position":"BB","stack":9,"hand":20},'
  + '"chosen":"fold","verdict":"wrong","responseMs":4200},'
  + '{"ts":1760371320000,"dateKey":"2026-10-13","mode":"run","spot":{"kind":"open","position":"UTG","stack":17,"hand":0},'
  + '"chosen":"shove","verdict":"close","responseMs":900}],'
  + '"daily":{"2026-10-12":{"dateKey":"2026-10-12","correct":16,"total":20,"durationMs":95000}},'
  + '"runs":[{"ts":1760371300000,"dateKey":"2026-10-12","placement":1240,"finalTable":false,"levelsCompleted":3,"bonusXp":30}],'
  + '"bestRun":{"ts":1760371300000,"dateKey":"2026-10-12","placement":1240,"finalTable":false,"levelsCompleted":3,"bonusXp":30},'
  + '"activeRun":{"levelIndex":1,"spotInLevel":2,"lives":2,"status":"running","answered":7},'
  + '"dailyProgress":{"dateKey":"2026-10-13","index":7,"correct":5,"elapsedMs":42000}}';

/**
 * A save exactly as the app on main after Plan 8 writes it (what the player's phone holds today): schema version 1,
 * push/fold and starthand records, the remembered starthand filter, no retraining.
 */
export const PLAN8_SAVE =
  '{"schemaVersion":1,"profile":{"xp":2310,"combo":0,"soundOn":true,"preflopFilter":{"kind":"vsOpen","stack":"all"}},'
  + '"days":{"2026-10-12":24,"2026-10-13":31},'
  + '"decisions":['
  + '{"ts":1760371200000,"dateKey":"2026-10-13","mode":"training","spot":{"kind":"open","position":"BTN","stack":10,"hand":5},'
  + '"chosen":"shove","verdict":"correct","responseMs":1800},'
  + '{"ts":1760371260000,"dateKey":"2026-10-13","mode":"training","game":"preflop",'
  + '"spot":{"kind":"vsOpen","stack":100,"hero":"BTN","villain":"CO","hand":0},"chosen":"threeBet","verdict":"correct","responseMs":2500},'
  + '{"ts":1760371320000,"dateKey":"2026-10-13","mode":"training","game":"preflop",'
  + '"spot":{"kind":"rfi","stack":40,"hero":"UTG","villain":null,"hand":100},"chosen":"raise","verdict":"wrong","responseMs":3100}],'
  + '"daily":{"2026-10-12":{"dateKey":"2026-10-12","correct":16,"total":20,"durationMs":95000}},'
  + '"runs":[],"bestRun":null,"activeRun":null,"dailyProgress":null}';
