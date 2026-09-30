/**
 * 面接設定数の定点観測 → Slack通知
 *
 * 既存のApps Scriptプロジェクトに「別ファイル」として追加して使う。
 * （既存のHEADERS・doGet/doPost等には触れない。内部ヘルパーは ir_ 接頭辞で名前衝突を回避）
 *
 * 必要数はフロント（index.html の REQUIRED_INTERVIEW1 / REQUIRED_INTERVIEW_FINAL）と同じ値を保つこと。
 */
const REQUIRED_INTERVIEW1 = 20;
const REQUIRED_INTERVIEW_FINAL = 4;

// ⚠ リポジトリはpublicのため、URLはここにコミットしない。
//   GASエディタ上でこの定数に直接貼り付けるか、スクリプトプロパティ SLACK_WEBHOOK_URL に設定する。
const SLACK_WEBHOOK_URL = "";

const IR_WINDOW_DAYS = 30; // 今日を含む30日間
const IR_EXCLUDED_POSITION = "人事";
const IR_POSITION_ALIASES = { "デジタルマーケティング": "マーケ総合職", "マーケ即戦力": "マーケティングコンサル", "セールス": "セールスコンサル", "営業": "セールスコンサル", "人事・採用担当": "人事" };
const IR_TZ = "Asia/Tokyo";
const IR_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** トリガーから実行される本体 */
function postInterviewReport() {
  const url = ir_getWebhookUrl_();
  if (!url) {
    console.warn("SLACK_WEBHOOK_URL が未設定のため、面接設定状況の通知をスキップしました");
    return;
  }
  const text = ir_buildReportText_();
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error("Slack投稿に失敗しました: " + code + " " + res.getContentText());
  console.log("Slackに投稿しました\n" + text);
}

/** 手動実行用（動作確認）：同じ内容を即時投稿 */
function postInterviewReportNow() {
  postInterviewReport();
}

/** 投稿せずに本文だけログで確認したいとき用 */
function previewInterviewReport() {
  console.log(ir_buildReportText_());
}

/** 毎週月曜15:00（JST）のトリガーを作成（既存の同名トリガーは削除してから作成） */
function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "postInterviewReport"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("postInterviewReport")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(15)
    .nearMinute(0)
    .inTimezone(IR_TZ)
    .create();
  console.log("postInterviewReport の週次トリガー（毎週月曜15時台・JST）を作成しました");
}

// ─── 内部ヘルパー ───

function ir_getWebhookUrl_() {
  if (SLACK_WEBHOOK_URL) return SLACK_WEBHOOK_URL;
  return PropertiesService.getScriptProperties().getProperty("SLACK_WEBHOOK_URL") || "";
}

function ir_buildReportText_() {
  const now = new Date();
  const from = Utilities.formatDate(now, IR_TZ, "yyyy-MM-dd");
  const to = Utilities.formatDate(new Date(now.getTime() + (IR_WINDOW_DAYS - 1) * 86400000), IR_TZ, "yyyy-MM-dd");
  const rows = ir_readCandidates_();

  const pick = function (dateKey, timeKey, resultKey, whoKey) {
    return rows
      .filter(function (r) { return (IR_POSITION_ALIASES[r.position] || r.position) !== IR_EXCLUDED_POSITION; })
      .map(function (r) {
        return { name: r.name || "（未入力）", position: r.position || "", date: ir_toDate_(r[dateKey]), time: ir_toTime_(r[timeKey]), who: String(r[whoKey] || ""), result: String(r[resultKey] || "").trim() };
      })
      .filter(function (x) { return x.date && x.date >= from && x.date <= to && !x.result; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  };
  const i1 = pick("interview1Date", "interview1Time", "interview1Result", "interviewer1");
  const fin = pick("interviewFinalDate", "interviewFinalTime", "interviewFinalResult", "interviewerFinal");

  const diffStr = function (n, req) { const d = n - req; return d > 0 ? "+" + d : d === 0 ? "±0" : String(d); };
  const line = function (x) {
    const d = new Date(x.date + "T00:00:00+09:00");
    const md = Utilities.formatDate(d, IR_TZ, "MM/dd") + "（" + IR_WEEKDAYS[Number(Utilities.formatDate(d, IR_TZ, "u")) % 7] + "）";
    const detail = [x.position, x.who].filter(String).join("／");
    return "・" + md + (x.time || "") + " " + x.name + (detail ? "（" + detail + "）" : "");
  };
  const section = function (list) { return list.length ? list.map(line).join("\n") : "予定なし"; };

  return [
    "【採用｜面接設定状況】" + Utilities.formatDate(now, IR_TZ, "yyyy/MM/dd") + "時点（今後" + IR_WINDOW_DAYS + "日）",
    "",
    "一次面接：" + i1.length + "名 ／ 必要" + REQUIRED_INTERVIEW1 + "名 ／ 差分 " + diffStr(i1.length, REQUIRED_INTERVIEW1),
    "最終面接：" + fin.length + "名 ／ 必要" + REQUIRED_INTERVIEW_FINAL + "名 ／ 差分 " + diffStr(fin.length, REQUIRED_INTERVIEW_FINAL),
    "",
    "■一次面接予定",
    section(i1),
    "",
    "■最終面接予定",
    section(fin),
    "",
    "※" + IR_EXCLUDED_POSITION + "ポジションは除外",
  ].join("\n");
}

/** 1行目に interview1Date を持つシートを候補者シートとみなして読み込む */
function ir_readCandidates_() {
  const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    const values = sheets[i].getDataRange().getValues();
    if (values.length === 0) continue;
    const headers = values[0].map(String);
    if (headers.indexOf("interview1Date") === -1) continue;
    return values.slice(1).map(function (row) {
      const o = {};
      headers.forEach(function (h, j) { o[h] = row[j]; });
      return o;
    });
  }
  throw new Error("interview1Date 列を持つ候補者シートが見つかりません");
}

function ir_toDate_(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v) || v.getFullYear() <= 1900 ? "" : Utilities.formatDate(v, IR_TZ, "yyyy-MM-dd");
  const m = String(v).match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  const d = new Date(v);
  return isNaN(d) ? "" : Utilities.formatDate(d, IR_TZ, "yyyy-MM-dd");
}

function ir_toTime_(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v) ? "" : Utilities.formatDate(v, IR_TZ, "HH:mm");
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? ("0" + m[1]).slice(-2) + ":" + m[2] : "";
}
