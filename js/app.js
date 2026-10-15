
/* ============================================================
   TIMETABLE STUDIO
   app.js

   01. 設定・共通関数
   02. 予定データの検証
   03. タイムラインの生成
   04. 現在の状態判定
   05. タイムラインの描画
   06. メイン画面の更新
   07. 背景アニメーション
   08. フルスクリーン
   09. 初期化
============================================================ */


/* ============================================================
   01. 設定・共通関数
============================================================ */

import { config } from './config.js';

// IDからHTML要素を取得
const $ = id => document.getElementById(id);

// 1分をミリ秒に変換
const MINUTE = 60000;

// "09:30" → 570（分）
const parseTime = s => {
    const [h, m] = s.split(':').map(Number);

    return h * 60 + m;
};

// 数字を2桁にする
// 例：5 → "05"
const pad = n => String(n).padStart(2, '0');

// Date → "HH:MM"
const formatTime = d => {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 残り時間を分・秒に変換
const formatRemain = ms => {

    const sec = Math.max(
        0,
        Math.ceil(ms / 1000)
    );

    return {
        minutes: Math.floor(sec / 60),
        seconds: sec % 60
    };
};

// 分数を日本語表記に変換
// 例：150 → "2時間30分"
const prettyDuration = minutes => {

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return (
        `${hours ? `${hours}時間` : ''}` +
        `${mins ? `${mins}分` : ''}`
    ) || '0分';
};

// 日付の表示形式
const dateFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
});


/* ============================================================
   02. 予定データの検証
============================================================ */

/*
   config.js に登録された予定を整理する。

   ・開始時刻順に並び替える
   ・時刻が正しいか確認する
   ・予定の重複を検出する

   現時点では同一日内の予定のみ対応。
*/

function normalizeSchedules(items) {

    const result = items
        .map(item => ({
            ...item,

            startMin: parseTime(item.start),
            endMin: parseTime(item.end)
        }))
        .sort((a, b) => a.startMin - b.startMin);

    for (let i = 0; i < result.length; i++) {

        const event = result[i];

        // 時刻の不正を確認
        if (
            !Number.isFinite(event.startMin) ||
            !Number.isFinite(event.endMin) ||
            event.startMin >= event.endMin ||
            event.endMin > 1440
        ) {
            throw Error(
                `予定の時刻が不正: ${event.title}`
            );
        }

        // 前の予定との重複を確認
        if (
            i > 0 &&
            result[i - 1].endMin > event.startMin
        ) {
            throw Error(
                `予定が重複しています: ` +
                `${result[i - 1].title} / ${event.title}`
            );
        }
    }

    return result;
}

// 検証済み予定データ
const schedules = normalizeSchedules(config.schedules);


/* ============================================================
   03. タイムラインの生成
============================================================ */

/*
   タイムラインには2種類の区間がある。

   event : 予定がある時間
   gap   : 予定のない時間

   長いgapは表示幅を圧縮する。
*/

// 描画する区間を格納
const segments = [];


/* ------------------------------------------------------------
   空き時間を追加
------------------------------------------------------------ */

function addGap(startMin, endMin) {

    const gap = endMin - startMin;

    if (gap <= 0) {
        return;
    }

    // 圧縮する長さか判定
    const compressed =
        gap >= config.timeline.compressionThresholdMinutes;

    segments.push({
        type: 'gap',

        startMin,
        endMin,

        duration: gap,

        visual: compressed
            ? config.timeline.compressedGapDisplayMinutes
            : gap,

        compressed
    });
}


/* ------------------------------------------------------------
   タイムラインデータの構築
------------------------------------------------------------ */

// 最初の予定より前の空き時間
if (schedules.length) {

    addGap(
        0,
        schedules[0].startMin
    );
}

// 予定と予定の間
for (let i = 0; i < schedules.length; i++) {

    const event = schedules[i];

    // 前の予定との空き時間
    if (i > 0) {

        addGap(
            schedules[i - 1].endMin,
            event.startMin
        );
    }

    // 予定を追加
    segments.push({
        type: 'event',

        startMin: event.startMin,
        endMin: event.endMin,

        duration:
            event.endMin - event.startMin,

        visual:
            event.endMin - event.startMin,

        event
    });
}

// 最後の予定より後の空き時間
if (schedules.length) {

    addGap(
        schedules[schedules.length - 1].endMin,
        1440
    );
}


/* ============================================================
   04. 現在の状態判定
============================================================ */

/*
   現在時刻から以下を判定する。

   active : 予定が進行中
   idle   : 予定のない時間

   idleの場合は大きな時計を表示する。
*/


// 現在進行中の予定を取得
function findActive(min) {

    return schedules.find(
        event =>
            event.startMin <= min &&
            min < event.endMin
    );
}


// 次の予定を取得
function findNext(min) {

    return schedules.find(
        event => min < event.startMin
    );
}


/* ------------------------------------------------------------
   表示状態を取得
------------------------------------------------------------ */

function getDisplayState(now) {

    // 現在時刻を分単位に変換
    const min =
        now.getHours() * 60 +
        now.getMinutes() +
        now.getSeconds() / 60 +
        now.getMilliseconds() / 60000;

    const active = findActive(min);
    const next = findNext(min);

    // 予定が進行中
    if (active) {

        return {
            kind: 'active',

            active,
            next,

            remaining:
                (active.endMin - min) * MINUTE
        };
    }

    // 予定がない
    return {
        kind: 'idle',

        active: null,
        next,

        remaining: next
            ? (next.startMin - min) * MINUTE
            : null
    };
}


/* ============================================================
   05. タイムラインの描画
============================================================ */

function renderTimeline(now, state) {

    const container = $('timeline');

    // 前回の描画を削除
    container.replaceChildren();

    // 予定が1件もない場合
    if (!segments.length) {

        container.innerHTML = `
            <div class="segment gap" style="flex:1">
                <div class="segment-start">—</div>
                <div class="segment-name">
                    本日の予定はありません
                </div>
            </div>
        `;

        return;
    }

    // 現在時刻を分単位に変換
    const currentMin =
        now.getHours() * 60 +
        now.getMinutes() +
        now.getSeconds() / 60;

    // 各区間を描画
    for (const seg of segments) {

        const node = document.createElement('div');

        node.className = `segment ${seg.type}`;

        // 時間に比例した表示幅
        node.style.flex = `${seg.visual} 1 0px`;


        /* ----------------------------------------------------
           開始時刻
        ---------------------------------------------------- */

        const start = document.createElement('div');

        start.className = 'segment-start';

        start.textContent =
            `${pad(Math.floor(seg.startMin / 60))}:` +
            `${pad(seg.startMin % 60)}`;


        /* ----------------------------------------------------
           予定名・空き時間
        ---------------------------------------------------- */

        const label = document.createElement('div');

        label.className = 'segment-name';

        // 予定の場合
        if (seg.type === 'event') {

            node.style.setProperty(
                '--segment-color',
                seg.event.color || '#59788f'
            );

            node.title =
                `${seg.event.title} ` +
                `(${seg.event.start}–${seg.event.end})`;

            label.textContent = seg.event.title;

            // 終了済み
            if (currentMin >= seg.endMin) {
                node.classList.add('past');
            }

            // 現在進行中
            if (state.active?.id === seg.event.id) {
                node.classList.add('active');
            }

        } else {

            // 空き時間の場合
            label.textContent =
                `${seg.compressed ? '··· ' : ''}` +
                `${prettyDuration(seg.duration)} 空き`;

            node.title =
                `空き時間 ${prettyDuration(seg.duration)}` +
                `（${seg.compressed ? '圧縮表示' : '通常表示'}）`;
        }

        node.append(start, label);


        /* ----------------------------------------------------
           現在時刻ライン
        ---------------------------------------------------- */

        if (
            currentMin >= seg.startMin &&
            currentMin < seg.endMin
        ) {

            const line = document.createElement('div');

            line.className = 'now-line';

            // 区間内の現在位置を計算
            line.style.left =
                `${(
                    (currentMin - seg.startMin) /
                    seg.duration
                ) * 100}%`;

            node.append(line);
        }

        container.append(node);
    }
}


/* ============================================================
   06. メイン画面の更新
============================================================ */

/*
   1秒ごとに実行する。

   予定中：
       予定名
       残り時間
       進捗バー

   空き時間：
       現在時刻
       次の予定
*/

function render() {

    const now = new Date();

    const state = getDisplayState(now);


    /* --------------------------------------------------------
       共通表示
    -------------------------------------------------------- */

    $('date').textContent =
        dateFmt.format(now).toUpperCase();

    $('mini-clock').textContent =
        formatTime(now);

    $('event-count').textContent =
        ` · ${schedules.length} EVENTS`;


    // 時計モードのスタイル切り替え
    $('headline').classList.toggle(
        'is-clock',
        state.kind === 'idle'
    );

    $('value').classList.toggle(
        'clock-value',
        state.kind === 'idle'
    );

    $('hero-progress').classList.toggle(
        'hidden',
        state.kind === 'idle'
    );


    /* --------------------------------------------------------
       予定進行中
    -------------------------------------------------------- */

    if (state.kind === 'active') {

        $('status').textContent = '● IN PROGRESS';

        $('headline').textContent = state.active.title;

        // 残り時間
        const rem = formatRemain(state.remaining);

        $('value').replaceChildren(
            document.createTextNode(`${rem.minutes}`)
        );

        // 分・秒の単位
        const unit = document.createElement('span');

        unit.className = 'unit';

        unit.textContent =
            `分 ${pad(rem.seconds)}秒`;

        $('value').append(unit);


        // 時間・次の予定
        $('detail').textContent =
            `${state.active.start} — ${state.active.end}` +
            `  /  次の予定：` +
            `${state.next
                ? `${state.next.title} ${state.next.start}`
                : 'なし'
            }`;


        // 進捗バー
        const duration =
            (state.active.endMin - state.active.startMin)
            * MINUTE;

        const progress =
            (1 - state.remaining / duration) * 100;

        $('progress-fill').style.width =
            `${Math.min(100, Math.max(0, progress))}%`;

    } else {


        /* ----------------------------------------------------
           空き時間・予定終了
        ---------------------------------------------------- */

        $('status').textContent =
            state.next
                ? '◷ FREE TIME'
                : '✧ FREE TIME';

        $('headline').textContent =
            state.next
                ? '次の予定まで'
                : '本日の予定は終了';

        // 大きな時計
        $('value').textContent = formatTime(now);


        // 次の予定
        $('detail').textContent = state.next
            ? `${state.next.title} · ` +
              `${state.next.start}開始まで ` +
              `${prettyDuration(
                  Math.max(
                      1,
                      Math.ceil(state.remaining / MINUTE)
                  )
              )}`
            : (
                schedules.length
                    ? '本日のスケジュールはすべて終了しました'
                    : '本日の予定はありません'
            );
    }


    /* --------------------------------------------------------
       タイムライン情報
    -------------------------------------------------------- */

    $('timeline-caption').textContent =
        state.kind === 'active'
            ? 'NOW · 作業中'
            : state.next
                ? 'NEXT · ' + state.next.start
                : 'NO UPCOMING EVENTS';


    // タイムライン再描画
    renderTimeline(now, state);
}


/* ============================================================
   07. 背景アニメーション
============================================================ */

/*
   Canvasを使用した粒子アニメーション。

   config.animation から変更可能。

   particleCount : 粒子数
   speed         : 移動速度
   opacity       : 透明度
*/

function ambientCanvas() {

    const canvas = $('ambient');

    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return;
    }

    // OSのアニメーション軽減設定
    const reduced = matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    let width = 0;
    let height = 0;

    let raf = 0;
    let t = 0;


    /* --------------------------------------------------------
       粒子データの生成
    -------------------------------------------------------- */

    const dots = Array.from(
        {
            length: config.animation.particleCount
        },
        () => ({
            x: Math.random(),
            y: Math.random(),

            r: 0.5 + Math.random() * 1.25,

            phase: Math.random() * 6.28,
            speed: 0.3 + Math.random()
        })
    );


    /* --------------------------------------------------------
       Canvasサイズ調整
    -------------------------------------------------------- */

    function resize() {

        const dpr = Math.min(
            devicePixelRatio || 1,
            2
        );

        width = canvas.clientWidth;
        height = canvas.clientHeight;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        ctx.setTransform(
            dpr, 0,
            0, dpr,
            0, 0
        );
    }

    addEventListener('resize', resize);

    resize();


    /* --------------------------------------------------------
       アニメーション描画
    -------------------------------------------------------- */

    function draw() {

        // 前フレームを消去
        ctx.clearRect(0, 0, width, height);

        // 時間を進める
        t += 0.012 * config.animation.speed;


        // 各粒子を描画
        for (const dot of dots) {

            const x = (
                dot.x +
                Math.sin(
                    t * dot.speed + dot.phase
                ) * 0.03
            ) * width;

            const y = (
                dot.y +
                Math.cos(
                    t * dot.speed + dot.phase
                ) * 0.035
            ) * height;


            ctx.beginPath();

            ctx.arc(
                x,
                y,
                dot.r,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                `rgba(70,160,255, ${
                    config.animation.opacity *
                    (
                        0.4 +
                        0.5 *
                        Math.sin(t + dot.phase) ** 2
                    )
                })`;

            ctx.fill();
        }


        // 次のフレーム
        if (!reduced) {

            raf = requestAnimationFrame(draw);
        }
    }

    draw();


    /* --------------------------------------------------------
       タブが非表示になったとき
    -------------------------------------------------------- */

    document.addEventListener(
        'visibilitychange',
        () => {

            if (document.hidden) {

                cancelAnimationFrame(raf);

            } else if (!reduced) {

                draw();
            }
        }
    );
}


/* ============================================================
   08. フルスクリーン
============================================================ */

function fullScreen() {

    // フルスクリーン中なら解除
    if (document.fullscreenElement) {

        document.exitFullscreen();

    } else {

        // フルスクリーン開始
        document.documentElement
            .requestFullscreen?.()
            .catch(console.warn);
    }
}


// ボタンクリック
$('fullscreen').addEventListener(
    'click',
    fullScreen
);


// Fキーで切り替え
document.addEventListener(
    'keydown',
    e => {

        if (
            e.key.toLowerCase() === 'f' &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            e.target.tagName !== 'INPUT'
        ) {
            fullScreen();
        }
    }
);


/* ============================================================
   09. 初期化
============================================================ */

/* ------------------------------------------------------------
   ブランド設定
------------------------------------------------------------ */

$('brand-title').textContent =
    config.brand.name;

$('brand-logo').src =
    config.brand.logo;


/* ------------------------------------------------------------
   テーマカラー設定
------------------------------------------------------------ */

$('display').style.setProperty(
    '--accent',
    config.theme.accent
);

$('display').style.setProperty(
    '--background',
    config.theme.background
);


/* ------------------------------------------------------------
   アプリ起動
------------------------------------------------------------ */

// 初回表示
render();

// 1秒ごとに更新
setInterval(render, 1000);

// 背景アニメーション開始
ambientCanvas();
