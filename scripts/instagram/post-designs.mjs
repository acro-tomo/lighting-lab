// Instagram 投稿の内容定義。1トピック = 1カルーセル投稿。
// ここだけ編集すればスライドも文言も差し替えられる。
//
// 設計の前提（詳細は marketing/instagram/README.md）:
// - カルーセルは全スライドを 4:5 (1080x1350) で統一する。途中で比率が変わると表示が崩れる。
// - headline は「1行あたり全角13文字以内・最大3行」。それ以上はスマホの一覧で読めない。
// - plates は marketing/instagram/plates/ のファイル名（拡張子なし）。

export const BRAND = {
  handle: "@hosh1.921",
  name: "LDK LIGHTING LAB",
  url: "lighting-lab-46l.pages.dev",
  // アプリ本体の配色をそのまま使う（src/styles.css と同じ値）。
  base: "#070706",
  ink: "#F2EDE1",
  amber: "#F5C64D",
  cool: "#9BBEDD",
  muted: "rgba(242,237,225,0.52)"
};

/**
 * layout の種類
 * - "full"    : 画像を全面に敷き、下部グラデーションの上に見出し
 * - "band"    : 上に画像、下に無地の帯。文字量が多いリスト系で最も読みやすい
 * - "compare" : 画像2枚を左右に分割。Before/After・2条件の比較用
 * - "quad"    : 画像4枚を2x2。「全部並べた」系
 * - "point"   : 番号＋見出し＋本文。カルーセル中面のリスト項目用
 * - "outro"   : 保存導線と URL。カルーセル最終面用
 */
export const POSTS = [
  {
    id: "a-color-temp",
    title: "色温度4種の比べ方",
    // 週3（月水金 20:00）ローテーションの何本目か。
    slot: 0,
    caption: `照明の色は「明るさ」とは別の話です。

同じLDK・同じ家具・同じ灯数で、色温度だけを2700K〜6500Kに変えて並べました。
くつろぐ場所と手を動かす場所で必要な色は違います。部屋ごとに分けるのが正解です。

うちの間取りだとどうなるか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て #ダウンライト #間接照明 #インテリア照明 #リビング照明 #家づくり`,
    slides: [
      {
        layout: "compare",
        plates: ["warm-2700k", "daylight-6500k"],
        plateLabels: ["電球色 2700K", "昼光色 6500K"],
        eyebrow: "色を変えただけ",
        headline: ["同じ部屋です"],
        sub: "間取りも家具も照明の数も、まったく同じ"
      },
      {
        layout: "full",
        plates: ["warm-2700k"],
        eyebrow: "2700K 電球色",
        headline: ["いちばん", "落ち着く"],
        sub: "夜のリビング・寝室の定番。くつろぐ場所はここ"
      },
      {
        layout: "full",
        plates: ["neutral-3500k"],
        eyebrow: "3500K 温白色",
        headline: ["迷ったら", "ここ"],
        sub: "電球色より少し明るい。LDK全体に使いやすい"
      },
      {
        layout: "full",
        plates: ["cool-5000k"],
        eyebrow: "5000K 昼白色",
        headline: ["手元が", "よく見える"],
        sub: "キッチン・洗面・書斎向き",
        accent: "cool"
      },
      {
        layout: "full",
        plates: ["daylight-6500k"],
        eyebrow: "6500K 昼光色",
        headline: ["夜のリビング", "には強い"],
        sub: "青白く、くつろぎにくい。作業部屋なら選択肢",
        accent: "cool"
      },
      {
        layout: "quad",
        plates: ["warm-2700k", "neutral-3500k", "cool-5000k", "daylight-6500k"],
        plateLabels: ["2700K 電球色", "3500K 温白色", "5000K 昼白色", "6500K 昼光色"],
        eyebrow: "並べるとこの差",
        headline: ["部屋ごとに", "変えるのが正解"],
        sub: "全部を同じ色で揃える必要はありません"
      },
      {
        layout: "outro",
        plates: ["warm-2700k"],
        headline: ["保存して", "打ち合わせへ"],
        sub: "自分の間取り図を入れると、夜のLDKが見えます"
      }
    ]
  },
  {
    id: "b-regret-five",
    title: "照明で後悔する人の共通点5つ",
    slot: 1,
    caption: `照明の後悔は、夜になってから気づきます。

打ち合わせの段階でつぶせるものばかりなので、5つにまとめました。
1つでも当てはまったら、次の打ち合わせで確認してみてください。

うちの間取りだとどうなるか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て #ダウンライト #間接照明 #家づくりの後悔 #リビング照明 #家づくり`,
    slides: [
      {
        layout: "band",
        plates: ["daylight-6500k"],
        eyebrow: "打ち合わせの前に",
        headline: ["照明で後悔する人の", "共通点 5つ"],
        sub: "図面だけで決めてしまう、が1位",
        accent: "cool"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        num: "01",
        headline: ["図面だけで", "決めてしまう"],
        sub: "平面図に○が並んでいても、夜どう見えるかは分かりません。照明が主役になるのは日が落ちてからです。"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        num: "02",
        headline: ["明るさを", "「数」で決める"],
        sub: "灯数を増やせば良い部屋になるわけではありません。どこを照らすかで決まります。"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        num: "03",
        headline: ["全部を同じ", "色温度にする"],
        sub: "手を動かすキッチンと、くつろぐリビングで必要な色は違います。1軒を1色で揃える必要はありません。"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        num: "04",
        headline: ["調光を", "付けなかった"],
        sub: "あとから足せません。夜の可変幅がなくなり、いつも同じ明るさで過ごすことになります。"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        num: "05",
        headline: ["昼間の写真", "だけで判断した"],
        sub: "モデルハウスも施工事例も、明るい時間に撮られています。夜の見え方は別に確認が要ります。"
      },
      {
        layout: "outro",
        plates: ["warm-2700k"],
        headline: ["保存して", "打ち合わせへ"],
        sub: "自分の間取り図を入れると、夜のLDKが見えます"
      }
    ]
  },
  {
    id: "c-is-warm-dark",
    title: "電球色って本当に暗い？",
    slot: 2,
    caption: `「電球色は暗いから昼白色で」と言われたことはありませんか。

明るさ(lm)と色(K)は別々の数字です。電球色でもlmを上げれば明るくなります。
暗く感じるのは色のせいではなく、光の配り方が原因のことがほとんどです。

うちの間取りだとどうなるか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て #電球色 #ダウンライト #間接照明 #リビング照明 #家づくり`,
    slides: [
      {
        layout: "band",
        plates: ["warm-2700k"],
        eyebrow: "よくある質問",
        headline: ["電球色って", "本当に暗い？"],
        sub: "明るさ(lm)と色(K)は別の話です"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        headline: ["明るさ = lm", "色 = K"],
        sub: "別々の数字です。電球色(2700K)のままでも、lmを上げれば明るくなります。色を変える前に、まず明るさの話をしてください。"
      },
      {
        layout: "full",
        plates: ["warm-2700k"],
        eyebrow: "2700K 電球色",
        headline: ["暗いのではなく", "暖かい"],
        sub: "影が濃く残るぶん、落ち着いて見えます"
      },
      {
        layout: "full",
        plates: ["cool-5000k"],
        eyebrow: "5000K 昼白色",
        headline: ["明るく見えるが", "くつろぎにくい"],
        sub: "同じ明るさでも、夜は緊張感が出ます",
        accent: "cool"
      },
      {
        layout: "point",
        plates: ["warm-2700k"],
        headline: ["暗く感じる", "本当の理由"],
        sub: "光が一点に集まっていないことが原因です。壁や天井を照らすと、同じlmでも部屋は明るく感じます。"
      },
      {
        layout: "outro",
        plates: ["warm-2700k"],
        headline: ["保存して", "打ち合わせへ"],
        sub: "自分の間取り図を入れると、夜のLDKが見えます"
      }
    ]
  },
  // 以下は marketing/instagram/projects/ の各部屋の投稿。1部屋 = 1投稿で、
  // 「同じ部屋・同じ家具のまま照明だけ差し替えた前後」を軸にする。
  // プレートは npm run ig:rooms が撮る room-<id>.png（設計）と room-<id>-flat.png（等間隔）。
  ...roomPosts()
];

/** 部屋ごとの投稿は構成が同じなので、文言だけ差し替えて組み立てる。 */
function roomPost({ id, slot, title, room, plate, eyebrow, flat, designed, principle, detail, tags }) {
  const flatPlate = `${plate}-flat`;
  // 部屋まるごとのプレートなので、既定(1.55)より寄せずに全体を見せる。
  const framing = { plateZoom: 1.05, plateFocus: "50%" };
  return {
    id,
    slot,
    title,
    caption: `${room.hook}

${room.body}

うちの間取りだとどうなるか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て ${tags} #家づくり`,
    slides: [
      {
        layout: "compare",
        plates: [flatPlate, plate],
        plateLabels: ["等間隔に並べただけ", "設計した灯り"],
        eyebrow,
        headline: ["同じ部屋です", "違うのは照明だけ"],
        sub: room.cover
      },
      {
        layout: "full",
        plates: [flatPlate],
        ...framing,
        eyebrow: "よくある配灯",
        headline: flat.headline,
        sub: flat.sub,
        accent: "cool"
      },
      {
        layout: "full",
        plates: [plate],
        ...framing,
        eyebrow: "設計した灯り",
        headline: designed.headline,
        sub: designed.sub
      },
      {
        layout: "point",
        plates: [plate],
        ...framing,
        headline: principle.headline,
        sub: principle.sub
      },
      {
        layout: "full",
        plates: [plate],
        plateZoom: 1.28,
        plateFocus: detail.focus ?? "42%",
        eyebrow: detail.eyebrow,
        headline: detail.headline,
        sub: detail.sub
      },
      {
        layout: "outro",
        plates: [plate],
        ...framing,
        headline: ["保存して", "打ち合わせへ"],
        sub: "自分の間取り図を入れると、夜のLDKが見えます"
      }
    ]
  };
}

function roomPosts() {
  return [
  roomPost({
    id: "d-machiya-toriniwa",
    slot: 3,
    title: "京町家リノベ｜天井2.35mの細長い家",
    plate: "room-jp-machiya-toriniwa",
    eyebrow: "天井2.35m ｜ 間口4.2mの町家",
    tags: "#リノベーション #古民家リノベーション #和モダン",
    room: {
      hook: "「細長い家は暗くなる」と言われます。原因は間取りではなく、照明の置き方のことがあります。",
      body: `間口4.2m・奥行15mの町家をリノベした想定で、照明だけを2通り作りました。
天井いっぱいに等間隔で並べた夜と、低い灯りを点々と置いた夜。同じ部屋・同じ家具です。`,
      cover: "間口4.2m・奥行15mの町家。家具も間取りも同じです"
    },
    flat: {
      headline: ["等間隔に14灯", "並べた夜"],
      sub: "天井は明るくなりますが、奥行きは平らに潰れます"
    },
    designed: {
      headline: ["低い灯り10灯", "だけの夜"],
      sub: "2400Kの和紙ペンダントと行灯。天井は照らしません"
    },
    principle: {
      headline: ["細長い家は", "点で照らす"],
      sub: "通り庭に沿って灯りを点々と置くと、視線が奥へ抜けて長さが魅力になります。全体を均一に照らすと、逆に間口の狭さだけが目立ちます。"
    },
    detail: {
      eyebrow: "火袋の吹き抜け",
      headline: ["縦の抜けは", "縦に照らす"],
      sub: "高さ違いで2灯吊ると、上下の距離がそのまま見えます",
      focus: "35%"
    }
  }),
  roomPost({
    id: "e-hiraya-engawa",
    slot: 4,
    title: "和モダンの平屋｜ダウンライト4灯のLDK",
    plate: "room-jp-hiraya-engawa",
    eyebrow: "天井2.4m ｜ 12mの平屋LDK",
    tags: "#平屋 #間接照明 #建築化照明",
    room: {
      hook: "「LDKにダウンライトは何灯いりますか」と聞かれたら、まず何灯まで減らせるかを考えます。",
      body: `12m×7.2mの平屋LDKで、等間隔15灯の夜と、ダウンライト4灯＋建築化照明の夜を並べました。
明るさの総量ではなく、どこから光が来るかで印象が変わります。`,
      cover: "12m×7.2mの平屋LDK。家具も間取りも同じです"
    },
    flat: {
      headline: ["等間隔に15灯", "並べた夜"],
      sub: "手元は明るい。ただ、天井から下に降りてくるだけの光です"
    },
    designed: {
      headline: ["ダウンライト", "4灯だけの夜"],
      sub: "残りは折り上げ天井の中の間接照明3本とペンダント"
    },
    principle: {
      headline: ["天井を照らすと", "部屋は広く見える"],
      sub: "直接下ろす光を4灯まで減らし、残りは折り上げの中から天井へ返しています。反射した光は影が柔らかく、同じ明るさでも広く感じます。"
    },
    detail: {
      eyebrow: "縁側の大開口",
      headline: ["窓を黒く", "しない工夫"],
      sub: "窓辺に光を1つ置くと、大開口が黒い鏡になりません"
    }
  }),
  roomPost({
    id: "f-skipfloor-tokyo",
    slot: 5,
    title: "狭小3階建て｜天井4.4mの吹き抜けLDK",
    plate: "room-jp-skipfloor-tokyo",
    eyebrow: "天井4.4m ｜ 狭小3階建て",
    tags: "#狭小住宅 #吹き抜け #スキップフロア",
    room: {
      hook: "吹き抜けを作ったのに夜が暗い。よくある原因は、高い天井にダウンライトを付けたことです。",
      body: `7.4m×8.4m・天井4.4mのスキップフロアLDKで、等間隔9灯の夜と、吊り位置を下げた夜を並べました。
光は距離の2乗で弱まります。同じ器具でも、どこに吊るかで手元の明るさが変わります。`,
      cover: "天井4.4mのスキップフロアLDK。家具も間取りも同じです"
    },
    flat: {
      headline: ["天井4.4mに", "9灯付けた夜"],
      sub: "床までの距離が遠く、灯数のわりに手元は暗くなります"
    },
    designed: {
      headline: ["吊りを2.6m", "下ろした夜"],
      sub: "主役は低く吊った1灯。壁はスポットで洗って広さを出します"
    },
    principle: {
      headline: ["高い天井ほど", "灯りは下ろす"],
      sub: "光は距離の2乗で弱まります。4.4mの天井に付けた1灯は、2.4mに付けた1灯の約3分の1しか届きません。灯数を増やす前に、吊る高さを見直すほうが効きます。"
    },
    detail: {
      eyebrow: "メザニンの下",
      headline: ["天井が2つ", "あるなら光も2つ"],
      sub: "ロフト下は2.35m。高さが違えば器具も分けます"
    }
  }),
  roomPost({
    id: "g-copenhagen-apartment",
    slot: 6,
    title: "北欧の住戸｜ダウンライト0灯の夜",
    plate: "room-dk-copenhagen-apartment",
    eyebrow: "天井3.25m ｜ 北欧の住戸",
    tags: "#北欧インテリア #ペンダントライト #リビング照明",
    room: {
      hook: "北欧の部屋の写真に、ダウンライトがほとんど写っていないことに気づいていましたか。",
      body: `天井3.25mの住戸で、等間隔8灯の夜と、ダウンライト0灯・小さな灯り9つの夜を並べました。
天井を明るくするのではなく、目線の高さに灯りを散らす作り方です。`,
      cover: "天井3.25mの住戸。家具も間取りも同じです"
    },
    flat: {
      headline: ["天井から", "8灯で照らす夜"],
      sub: "均一で明るい。ホテルのロビーのような顔になります"
    },
    designed: {
      headline: ["ダウンライト", "0灯の夜"],
      sub: "低い吊り4つとブラケット5つ。天井には何も付けません"
    },
    principle: {
      headline: ["暗い場所を", "残していい"],
      sub: "部屋の隅まで均一に照らすと、夜でも昼のような緊張感が残ります。灯りを目線の高さに散らして暗い部分を残すほうが、くつろげる部屋になります。"
    },
    detail: {
      eyebrow: "吊る高さ",
      headline: ["テーブルから", "60cmまで下げる"],
      sub: "天井が高くても、吊り位置は天井ではなく人に合わせます"
    }
  }),
  roomPost({
    id: "h-mediterranean-arch",
    slot: 7,
    title: "南欧のアーチの家｜壁を照らす夜",
    plate: "room-es-mediterranean-arch",
    eyebrow: "天井3.05m ｜ 南欧の家",
    tags: "#塗り壁 #ブラケットライト #インテリア照明",
    room: {
      hook: "同じ明るさでも「広く見える部屋」と「狭く見える部屋」があります。違いは、どこを照らしているかです。",
      body: `塗り壁とアーチの家で、床に光を落とした夜と、壁を照らした夜を並べました。
壁が明るいと、視界に入る面が明るくなるぶん部屋は広く感じます。`,
      cover: "梁現しと塗り壁の家。家具も間取りも同じです"
    },
    flat: {
      headline: ["床に光を", "落とした夜"],
      sub: "足元は明るい。壁が暗いままなので、部屋は狭く見えます"
    },
    designed: {
      headline: ["壁を照らした夜", "灯りは11個"],
      sub: "ブラケットとランタンで、塗り壁を斜めから舐めます"
    },
    principle: {
      headline: ["床ではなく", "壁を照らす"],
      sub: "人が広さを感じるのは、床の明るさではなく視界に入る壁の明るさです。塗り壁を斜めから照らすと、広さと同時に手仕事の質感も出ます。"
    },
    detail: {
      eyebrow: "梁と天井",
      headline: ["影を消さない", "という選び方"],
      sub: "梁の影は失敗ではありません。陰影が奥行きを作ります",
      focus: "30%"
    }
  }),
  roomPost({
    id: "i-brooklyn-loft",
    slot: 8,
    title: "ロフト｜天井4.2mの大空間を照らす",
    plate: "room-us-brooklyn-loft",
    eyebrow: "天井4.2m ｜ 13.5mのロフト",
    tags: "#リノベーション #スポットライト #インダストリアル",
    room: {
      hook: "広いLDKほど「全部を明るく」しがちですが、均一に照らすほど部屋は体育館に近づきます。",
      body: `13.5m×8.6m・天井4.2mのロフトで、等間隔24灯の夜と、光だまりを作った夜を並べました。
使う場所ごとに明るさの山を作ると、広さがそのまま魅力になります。`,
      cover: "天井4.2m・13.5mのロフト。家具も間取りも同じです"
    },
    flat: {
      headline: ["24灯で全部", "明るくした夜"],
      sub: "隅まで均一。広いのに、どこにいても同じ顔になります"
    },
    designed: {
      headline: ["光だまりを", "作った夜"],
      sub: "スポット6灯と長く吊ったペンダント5灯。間は暗くていい"
    },
    principle: {
      headline: ["広い部屋ほど", "全部を照らさない"],
      sub: "食卓・キッチン・ソファと、使う場所ごとに明るさの山を作ります。間に暗がりが残るほうが、部屋は広く、居場所は多く感じられます。"
    },
    detail: {
      eyebrow: "レンガと鋳鉄の柱",
      headline: ["素材は", "斜めから照らす"],
      sub: "正面から当てると平らに。角度をつけると目地に影が出ます"
    }
    })
  ];
}
