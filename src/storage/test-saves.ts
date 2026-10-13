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
