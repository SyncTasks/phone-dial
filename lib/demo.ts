import type { Status, Task } from "./tasks";
import { taskKey } from "./tasks";

// Invented sample tasks for DEMO=1 (local preview without the sheet). Not real data.

const SAMPLES: [Status, string, string, string][] = [
  ["進行中", "案件マップに条件保存機能を付ける", "【人材紹介事業部】", "高"],
  ["進行中", "粗利レポートを職種別に分ける", "Akindo・indeed運用", "高"],
  ["未着手", "応募者管理表のアポを各CAのカレンダーに自動追加", "【人材紹介事業部】", "-"],
  ["未着手", "求人ボックスの通知漏れを調査", "【人材紹介事業部】", "-"],
  ["未着手", "kbx bot の設定漏れ時に通知を出す", "Akindo競合リサーチ", "中"],
  ["未着手", "代理店アカウントのシートでプルダウン変更時に通知", "Akindo経理部", "-"],
  ["未着手", "Indeed 自動転記の可否を調べる", "Akindo競合リサーチ", "-"],
  ["未着手", "トス時に初回通電・2回目以降を入力できるようにする", "【人材紹介事業部】", "-"],
  ["未着手", "入金通知botをLINEに流す", "Akindo経理部", "中"],
  ["未着手", "ジモティの閲覧数が止まる日数をざっくり出す", "【人材紹介事業部】", "-"],
  ["保留", "アカウントごとに固定IPでログインする仕組みの調査", "Akindo競合リサーチ", "-"],
  ["保留", "トス成功録音の分析", "Akindo競合リサーチ", "-"],
  ["メモ", "参考：競合LPの構成メモ", "Akindo競合リサーチ", "-"],
  ["メモ", "Claude skills の使い方メモ", "Claude", "-"],
  ["完了", "粗利プログラム修正", "Akindo競合リサーチ", "高"],
  ["完了", "高齢者応募スクリプト作成", "【人材紹介事業部】", "-"],
  ["完了", "ブラック求人削除の定期実行", "Akindo競合リサーチ", "中"],
  ["完了", "給与明細データの格納フロー整理", "Akindo経理部", "-"],
];

export function demoTasks(now: number): Task[] {
  const day = 86400000;
  return Array.from({ length: 90 }, (_, i) => {
    const [status0, title, group, prio] = SAMPLES[i % SAMPLES.length];
    const age = Math.floor(i * 0.8);
    const status: Status = i >= SAMPLES.length && status0 !== "メモ" && i % 3 === 0 ? "完了" : status0;
    const no = String(200 - i);
    return {
      key: taskKey(no),
      no,
      row: i + 2,
      status,
      title: i < SAMPLES.length ? title : `${title}（例${Math.floor(i / SAMPLES.length)}）`,
      prio,
      due: i === 1 ? now - 2 * day : i === 4 ? now + day : null,
      dueText: i === 0 ? "なる早" : "",
      posted: now - age * day - (i % 5) * 3600000,
      group,
      note: i === 0 ? "原本ボタンの隣あたりに置く" : "",
      url: "",
    };
  });
}
