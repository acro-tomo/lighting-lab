import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "ja" | "en";

const STORAGE_KEY = "ldk-language";

const en: Record<string, string> = {
  "Local Web Simulator": "Local Web Simulator",
  "メニュー": "Menu",
  "プロジェクト操作": "Project actions",
  "間取り図の読込": "Import floor plan",
  "プロジェクト保存": "Save project",
  "プロジェクト読込": "Open project",
  "表示モード": "View mode",
  "編集": "Edit",
  "リアル": "Realistic",
  "仕上がり": "Finished look",
  "仕上がり画像を作る": "Create finished image",
  "照明や家具を配置・調整する": "Place and adjust lights and furniture",
  "光の反射を含めた仕上がりを確認する": "View the finished look with reflected light",
  "編集モード": "Edit mode",
  "仕上がりを準備中…": "Preparing finished look…",
  "仕上がり表示": "Finished look",
  "画像を作る": "Create image",
  "作成を中止": "Stop creating",
  "画像を保存": "Save image",
  "画像を作成中 {percent}%": "Creating image {percent}%",
  "仕上がり画像": "Finished image",
  "画像の作成を停止しました": "Image creation stopped",
  "画像を作れませんでした。3D表示を確認してください": "Could not create the image. Check the 3D view.",
  "仕上がり画像を作成しています": "Creating finished image",
  "画像ができました": "Image is ready",
  "画像を作れませんでした": "Could not create the image",
  "この端末では仕上がり画像を作れません": "Finished images are not available on this device",
  "画像を作れませんでした。時間をおいてもう一度お試しください": "Could not create the image. Please try again later.",
  "3D表示を準備中です。": "Preparing the 3D view.",
  "仕上がり画像を作ると、現在の3D表示を保存できます。": "Create a finished image to save the current 3D view.",
  "床をクリック": "Click the floor",
  "出力 / レンダリング": "Export / Render",
  "使い方を見る": "How it works",
  "言語": "Language",
  "日本語": "日本語",
  "English": "English",
  "間取り編集": "Edit plan",
  "壁の選択・移動・削除、壁引き": "Select, move, or delete walls, then draw new walls.",
  "壁を引く": "Draw walls",
  "＋追加": "+ Add",
  "追加するもの": "Add to your plan",
  "壁の照明": "Wall lights",
  "間接照明": "Indirect lighting",
  "リビング": "Living room",
  "ダイニング・仕事": "Dining and work",
  "水まわり": "Bathroom and utility",
  "寝室・収納": "Bedroom and storage",
  "自由な形": "Custom shape",
  "天井に埋め込む": "Recessed into the ceiling",
  "天井から吊るす": "Suspended from the ceiling",
  "壁に取り付ける": "Mounted on a wall",
  "光源を隠して照らす": "Concealed indirect light",
  "配置する窓の大きさ": "Window size",
  "横幅": "Width",
  "この大きさで配置": "Place at this size",
  "この壁には入りません。窓を小さくして選び直してください。": "It does not fit on this wall. Choose the window again with a smaller size.",
  "← 戻る": "← Back",
  "自分の間取りで照明を試す": "Explore lighting in your own floor plan",
  "自分の間取り図を取り込み、照明の位置・明るさ・色温度を変えて、部屋の雰囲気を比較できます。": "Import your floor plan, then compare the room atmosphere by changing fixture placement, brightness, and color temperature.",
  "ダウンライト・ペンダント・壁付スポットなど複数種の照明を自由に配置できます。": "Place downlights, pendants, wall spots, and other fixture types freely.",
  "Path Tracing による間接光レンダリングで雰囲気を視覚確認できます。": "Use path-traced indirect light to visually compare the atmosphere.",
  "壁や床からの光の反射も含めた仕上がりを確認できます。": "View the finished look including light reflected from walls and floors.",
  "雰囲気比較用シミュレーションです。実照度（lux）の保証はしません。": "This is a visual simulation for comparing lighting layouts and atmosphere. It does not guarantee real illuminance (lux).",
  "基本操作": "Getting started",
  "スマホでは読み込み・保存・出力を開く": "On mobile, open import, save, and export from this menu.",
  "スマホでは下タブで切替、設定は歯車": "On mobile, switch views with the bottom tabs and open settings with the gear.",
  "タップ": "Tap",
  "選択・配置": "Select or place",
  "ピンチ": "Pinch",
  "平面図をズーム": "Zoom the plan",
  "ドラッグ / 二本指": "Drag / two fingers",
  "3D視点の回転・パン": "Rotate or pan the 3D view",
  "注視点だけを動かして見回す（カメラ固定）": "Look around by moving the target while keeping the camera fixed.",
  "視点を前後 / 左右に移動": "Move the camera forward/back or left/right.",
  "視点を上下に移動": "Move the camera up/down.",
  "カメラが注視点の周りを回る": "Orbit the camera around the target.",
  "はじめる": "Start exploring",
  "フィードバック": "Feedback",
  "ご意見・不具合の報告": "Feedback or bug report",
  "閉じる": "Close",
  "種別": "Type",
  "要望": "Feature request",
  "不具合": "Bug report",
  "起きたこと・再現手順・期待した動作など": "What happened, steps to reproduce, and what you expected.",
  "ほしい機能・改善してほしい点など": "A feature you would like or an improvement to make.",
  "連絡先（任意・返信がほしい場合）": "Contact (optional, if you would like a reply)",
  "送信中…": "Sending…",
  "送信": "Send",
  "内容は開発者の課題管理（GitHub）に送られます。個人情報や機密は書かないでください。": "Your message goes to the developer's private issue tracker. Do not include personal or sensitive information.",
  "内容を入力してください。": "Please enter a message.",
  "送信しました。ありがとうございます。": "Sent. Thank you!",
  "送信に失敗しました。": "Could not send feedback.",
  "ご意見・不具合を送る": "Send feedback or report a bug",
  "プロパティインスペクター": "Properties inspector",
  "戻る": "Back",
  "部屋設定": "Room settings",
  "部屋全体の設定 +": "Whole-room settings +",
  "— 構造を選択 —": "— Choose a structure —",
  "木造（初期 240mm）": "Wood frame (default 240 mm)",
  "RC（初期 200mm）": "Reinforced concrete (default 200 mm)",
  "自由入力": "Custom",
  "照明や家具は、2Dまたは3D画面で直接選択できます。": "Select lights and furniture directly in the 2D or 3D view.",
  "部屋の集計": "Room summary",
  "家具を編集": "Edit furniture",
  "を編集": " settings",
  "ダウンライト": "Downlight",
  "スポットライト": "Spotlight",
  "ペンダント": "Pendant",
  "ブラケット": "Wall light",
  "テープライト": "Tape light",
  "照明": "Lights",
  "家具": "Furniture",
  "有効lm": "Active lm",
  "メインクロス（壁全体）": "Main wall finish (all walls)",
  "全壁の素材を一括変更": "Change material for all walls",
  "— 素材を選んで適用 —": "— Select a material to apply —",
  "照明一覧": "Lighting",
  "部屋全体に適用": "Applies to the entire room",
  "{count}灯すべての色温度を変更します": "Changes color temperature for all {count} fixtures",
  "全照明の色温度を一括変更": "Set color temperature for all lights",
  "照明を選択": "Select a light",
  "— 照明を選択 —": "— Select a light —",
  "ℹ 免責": "ℹ Disclaimer",
  "これは照明配置・雰囲気比較用の視覚シミュレーションです。実際の照度、配光、色、施工後の見え方を保証するものではありません。": "This is a visual simulation for comparing lighting layouts and atmosphere. It does not guarantee actual illuminance, light distribution, color, or the finished result.",
  "自動保存": "Autosaved",
  "ON": "ON",
  "OFF": "OFF",
  "壁をクリックして設置（Escで終了）": "Click a wall to place it (Esc to cancel)",
  "クリックした位置に配置": "Click to place",
  "タップ、または押して引いて壁を作成。Enter/ダブルクリックで終了": "Tap, or press and drag to draw walls. Press Enter or double-click to finish.",
  "壁を選択・ドラッグで移動。Deleteで削除": "Select and drag walls to move them. Press Delete to remove.",
  "クリックで選択、選択後ドラッグで移動": "Click to select, then drag the selection to move it.",
  "階切替": "Floor switcher",
  "1階": "Floor 1",
  "2階": "Floor 2",
  "1階を編集": "Edit floor 1",
  "2階を編集（1階の壁を薄く表示して作図補助）": "Edit floor 2 (floor 1 walls remain visible as a guide)",
  "2階編集中 — 1階の壁を薄く表示して作図補助": "Editing floor 2 — floor 1 walls are shown as a guide",
  "スマホ編集操作": "Mobile editing actions",
  "元に戻す": "Undo",
  "やり直す": "Redo",
  "削除": "Delete",
  "解除": "Clear",
  "3D表示": "3D view",
  "通常表示に戻す": "Return to normal view",
  "3Dを最大化": "Maximize 3D",
  "BVH生成中…": "Building BVH…",
  "間接光リアル描画 / {count} samples 収束済み": "Realistic indirect light / {count} samples converged",
  "間接光リアル描画 / {count} samples 収束中": "Realistic indirect light / converging at {count} samples",
  "編集プレビュー": "Edit preview",
  "露出": "Exposure",
  "日光": "Daylight",
  "日光を有効にする": "Enable daylight",
  "時刻": "Time",
  "月": "Month",
  "日": "Day",
  "北方位°": "North offset°",
  "緯度°": "Latitude°",
  "品質": "Quality",
  "標準": "Standard",
  "高品質": "High",
  "最高": "Ultra",
  "診断": "Diagnostics",
  "通常": "Beauty",
  "マテリアル": "Material",
  "法線": "Normals",
  "表裏": "Front / back",
  "レンダリング停止": "Stop render",
  "レンダリング開始": "Start render",
  "PNG書き出し": "Export PNG",
  "残り": "remaining",
  "設定を閉じる": "Close settings",
  "スマホ表示切替": "Mobile view switcher",
  "設定を開く": "Open settings",
  "設定": "Settings"
  ,"2D平面図エディタ": "2D plan editor"
  ,"平面配置": "Plan layout"
  ,"2Dを最大化": "Maximize 2D"
  ,"ズーム": "Zoom"
  ,"拡大": "Zoom in"
  ,"縮小": "Zoom out"
  ,"全体表示": "Fit to view"
  ,"縮尺": "Scale"
  ,"背景合わせ": "Align background"
  ,"1階基準": "Use floor 1 alignment"
  ,"完了": "Done"
  ,"北": "North"
  ,"1階の薄い壁を目安に、二階の背景画像をドラッグして位置を合わせます。終わったら完了。": "Drag the floor 2 background image to align it with the faint floor 1 walls, then select Done."
  ,"壁または吹き抜け内周に近づけると青くハイライト。クリックで壁付け照明を設置。": "A wall or void edge highlights blue when targeted. Click to place the wall-mounted light."
  ,"壁に近づけると青くハイライト。その壁をクリックで設置。設置後は壁上をドラッグで位置調整。": "A nearby wall highlights blue. Click it to place this item, then drag along the wall to adjust it."
  ,"クリックした位置にオブジェクトを配置します。": "Click to place the object."
  ,"オブジェクトをクリックで選択、ドラッグで移動。何もない所のドラッグで平面図をパン。Deleteで削除。": "Click an object to select it and drag to move it. Drag empty space to pan. Press Delete to remove."
  ,"壁をクリックで選択、ドラッグで移動。Deleteで削除。何もない所のドラッグで平面図をパン。": "Click a wall to select it and drag to move it. Press Delete to remove. Drag empty space to pan."
  ,"角に近づけてタップ、または押して引いて離すと壁を作成。スマホは水平/垂直へ強めにスナップします。内側は下のボタンで指定できます。": "Tap near a corner, or press, drag, and release to create a wall. On mobile, walls snap strongly to horizontal or vertical. Choose the inside below."
  ,"壁作成": "Wall drawing"
  ,"1点戻す": "Undo point"
  ,"壁の内側": "Wall interior"
  ,"中央": "Center"
  ,"左": "Left"
  ,"右": "Right"
  ,"上": "Up"
  ,"下": "Down"
  ,"中止": "Cancel"
  ,"選択中の照明": "Selected light"
  ,"選択中の家具": "Selected furniture"
  ,"点灯中": "On"
  ,"消灯中": "Off"
  ,"明るさ": "Brightness"
  ,"色温度": "Color temperature"
  ,"吊り長さ": "Drop length"
  ,"天井から": "From ceiling"
  ,"設置高さ": "Mount height"
  ,"床からの高さ": "Height from floor"
  ,"器具・配光": "Fixture and distribution"
  ,"器具": "Fixture"
  ,"グレアレス": "glare-reduced"
  ,"照射先": "Aim target"
  ,"長さ": "Length"
  ,"名前": "Name"
  ,"明るさ（光束）": "Brightness (luminous flux)"
  ,"光の広がり（器具プリセットを上書き）": "Beam spread (overrides fixture preset)"
  ,"メモ": "Notes"
  ,"{count}個のライトを選択中": "{count} lights selected"
  ,"変更は全選択ライトに適用されます。": "Changes apply to all selected lights."
  ,"調光": "Dimming"
  ,"種類": "Type"
  ,"テープ": "Tape light"
  ,"光束": "Luminous flux"
  ,"色温度プリセット": "Color temperature presets"
  ,"照射角度": "Beam angle"
  ,"電球色": "Warm white"
  ,"温白色": "Neutral white"
  ,"昼白色": "Cool white"
  ,"昼光色": "Daylight white"
  ,"ボックス": "Box"
  ,"丸テーブル": "Round table"
  ,"角テーブル": "Rectangular table"
  ,"椅子": "Chair"
  ,"ソファ": "Sofa"
  ,"ベッド": "Bed"
  ,"キッチン": "Kitchen"
  ,"カップボード": "Cupboard"
  ,"冷蔵庫": "Refrigerator"
  ,"可動棚": "Shelf"
  ,"カウンター": "Counter"
  ,"ラグ": "Rug"
  ,"階段": "Stairs"
  ,"幅": "Width"
  ,"高さ": "Height"
  ,"高さ（天井からの追加分）": "Height (added above ceiling)"
  ,"通常天井の高さから上端までの追加分です。未指定時は天井高さや2階の壁高さから自動計算されます。": "Extra height above the normal ceiling to the void's top. If unset, it's calculated automatically from the ceiling height or the upper floor's wall height."
  ,"奥行": "Depth"
  ,"回転": "Rotation"
  ,"影を落とす": "Cast shadow"
  ,"窓（ガラス）": "Window (glass)"
  ,"扉": "Door"
  ,"開口": "Opening"
  ,"設置する壁": "Wall to place on"
  ,"床から上端": "Floor to top edge"
  ,"壁上の位置": "Position on wall"
  ,"内周壁": "Interior walls"
  ,"壁あり": "Wall"
  ,"開放": "Open"
  ,"2階廊下などで壁が無い辺は「開放」にします。壁付け照明は壁ありの辺にだけ付きます。": "Set sides without a wall, such as an upper-floor corridor edge, to Open. Wall-mounted lights can only attach to sides with a wall."
  ,"下がり": "Ceiling drop"
  ,"下げ量": "Floor drop"
  ,"室内床レベル": "Interior floor level"
  ,"土間の下がり量をこの値に合わせると土間が地面(0)になる": "Match the entry floor drop to this value to place the entry floor at ground level (0)."
  ,"始点X": "Start X"
  ,"始点Z": "Start Z"
  ,"終点X": "End X"
  ,"終点Z": "End Z"
  ,"厚み": "Thickness"
  ,"通常壁": "Full wall"
  ,"腰壁": "Half wall"
  ,"手すり": "Railing"
  ,"腰壁/手すりは吹き抜けまわりの表現に使えます。高さは上の欄で微調整可。": "Use half walls or railings around a double-height space. Fine-tune their height above."
  ,"内側方向": "Interior direction"
  ,"中央（既定）": "Center (default)"
  ,"左（start→end向きで左）": "Left (facing start → end)"
  ,"右（start→end向きで右）": "Right (facing start → end)"
  ,"start→endへ向かって室内側がどちらか。背景間取り図の内壁線にトレース線を合わせるとき使う": "Choose which side faces the room when looking from start to end. Use this when tracing an interior wall line on a floor-plan image."
  ,"素材": "Material"
  ,"壁紙はこの素材「{name}」を使う全ての壁に反映されます。": "Wallpaper applies to every wall using the material “{name}”."
  ,"壁紙画像": "Wallpaper image"
  ,"壁紙プレビュー": "Wallpaper preview"
  ,"柄の幅": "Pattern width"
  ,"柄の高さ": "Pattern height"
  ,"壁紙を外す": "Remove wallpaper"
  ,"詳細 +": "Details +"
  ,"フィードバック送信は現在利用できません。": "Feedback is unavailable right now."
  ,"フィードバック送信に失敗しました。時間をおいて再度お試しください。": "Could not send feedback. Please try again later."
  ,"中心": "Center"
  ,"から": "from"
  ,"壁との距離を確認": "Check distance from walls"
  ,"配置の目安": "Placement guide"
  ,"2D/3D共通": "Shared by 2D / 3D"
  ,"基準壁": "Reference wall"
  ,"壁なし": "No wall"
  ,"壁中心": "Wall center"
  ,"終点側": "toward end"
  ,"始点側": "toward start"
  ,"未計算": "Not calculated"
  ,"壁線から": "From wall line"
  ,"横ライン": "Horizontal alignment"
  ,"奥行ライン": "Depth alignment"
  ,"比較対象なし": "No reference"
  ,"{name} と一致": "Aligned with {name}"
  ,"{name} まで {distance}": "{distance} from {name}"
  ,"近い基準なし（最寄り {name} まで {distance}）": "No close alignment (nearest: {name}, {distance})"
  ,"設置位置": "Placement"
  ,"窓": "Windows"
  ,"建具": "Doors"
  ,"開口・構造": "Openings and structure"
  ,"吹き抜け": "Double-height void"
  ,"下げ天井": "Dropped ceiling"
  ,"下げ床(土間)": "Lowered entry floor"
  ,"壁をクリック": "Click a wall"
  ,"ショートカット案内": "Keyboard shortcuts"
  ,"ショートカット案内を隠す": "Hide keyboard shortcuts"
  ,"ショートカット案内を表示": "Show keyboard shortcuts"
  ,"視点を前に移動": "Move camera forward"
  ,"視点を後ろに移動": "Move camera backward"
  ,"視点を左に移動": "Move camera left"
  ,"視点を右に移動": "Move camera right"
  ,"クリック": "Click"
  ,"ライト複数選択": "Select multiple lights"
  ,"カメラが注視点の周りを左に回る": "Orbit camera left around target"
  ,"カメラが注視点の周りを右に回る": "Orbit camera right around target"
  ,"視点を上に移動": "Move camera up"
  ,"視点を下に移動": "Move camera down"
  ,"コピー": "Copy"
  ,"貼り付け": "Paste"
  ,"やり直し": "Redo"
  ,"配置終了 / 選択解除": "Finish placement / clear selection"
  ,"壁モード：頂点を確定": "Wall mode: confirm vertex"
  ,"縮尺合わせ": "Scale calibration"
  ,"実距離を入力し、表示された線に間取り図の同じ長さの部分を合わせてください。画像はドラッグ、二本指ピンチで調整できます。": "Enter a real-world distance, then align the displayed line with the same length on the floor plan. Drag or pinch with two fingers to adjust the image."
  ,"間取り図": "Floor plan"
  ,"実距離": "Real distance"
  ,"ガイド線の向き": "Guide-line orientation"
  ,"横": "Horizontal"
  ,"縦": "Vertical"
  ,"画像倍率": "Image zoom"
  ,"画像上": "On image"
  ,"線が画像から外れています": "The line is outside the image"
  ,"リセット": "Reset"
  ,"キャンセル": "Cancel"
  ,"確定": "Confirm"
  ,"待機中": "Waiting"
  ,"シーン変更によりレンダリングをリセットしました。": "Rendering was reset because the scene changed."
  ,"カメラ、家具、照明、材質が変更されたためレンダリングを停止しました。": "Rendering stopped because the camera, furniture, lights, or materials changed."
  ,"3Dキャンバスがまだ準備できていません。": "The 3D canvas is not ready yet."
  ,"レンダリングを開始できませんでした。3D表示を確認してください。": "Could not start rendering. Check the 3D view."
  ,"BVH生成とpath tracingを開始しています。": "Building the BVH and starting path tracing."
  ,"three-gpu-pathtracerで最終レンダリングを開始しました。": "Started the final render with three-gpu-pathtracer."
  ,"BVH生成中": "Building BVH"
  ,"path tracing中": "Path tracing"
  ,"レンダリング完了": "Render complete"
  ,"準備中": "Preparing"
  ,"案 {count}": "Option {count}"
  ,"視点": "Viewpoint"
  ,"{samples} samples のパストレース比較画像を保存しました。": "Saved a path-traced comparison image with {samples} samples."
  ,"停止しました": "Stopped"
  ,"レンダリングに失敗しました。": "Rendering failed."
  ,"ラウンジチェア": "Lounge chair"
  ,"大型植物": "Large plant"
  ,"乳白ガラスグローブ": "Opal glass globe"
  ,"薄い琥珀色の乳白ガラスがやわらかく光る小型ペンダント": "Small pendant with softly glowing amber-tinted opal glass"
  ,"暖白の手仕事左官": "Warm hand-troweled plaster"
  ,"焼きセメント床": "Burnished cement floor"
  ,"ハニー色トラバーチン": "Honey travertine"
  ,"深いウォルナット": "Deep walnut"
  ,"ウォルナット羽目板": "Walnut wall paneling"
  ,"オリーブ色ブークレ": "Olive bouclé"
  ,"コニャックレザー": "Cognac leather"
  ,"厚手オートミールウール": "Heavy oatmeal wool"
  ,"テラコッタ陶器": "Terracotta ceramic"
  ,"磨きモルタル": "Polished mortar"
  ,"黒染め真鍮": "Blackened brass"
  ,"生成りリネン": "Natural linen"
  ,"深い植物グリーン": "Deep botanical green"
  ,"温かいアイボリー金属": "Warm ivory metal"
  ,"北面 暖白左官壁": "North warm plaster wall"
  ,"ダイニング背面 ウォルナット壁": "Dining walnut feature wall"
  ,"キッチン背面 トラバーチン壁": "Kitchen travertine feature wall"
  ,"東面 暖白左官壁": "East warm plaster wall"
  ,"南面 ギャラリー左官壁": "South plaster gallery wall"
  ,"西面 大開口トラバーチン壁": "West travertine window wall"
  ,"西面 大開口 1": "West picture window 1"
  ,"西面 大開口 2": "West picture window 2"
  ,"西面 大開口 3": "West picture window 3"
  ,"西面 大開口 4": "West picture window 4"
  ,"南東階段上の吹き抜け": "Southeast stair double-height void"
  ,"北東ダイニング・キッチンの低天井": "Northeast dining and kitchen ceiling"
  ,"低いオリーブブークレソファ": "Low olive bouclé sofa"
  ,"Mole風ラウンジチェア 北": "Mole-inspired lounge chair, north"
  ,"Mole風ラウンジチェア 南": "Mole-inspired lounge chair, south"
  ,"厚手オートミールウールラグ": "Heavy oatmeal wool rug"
  ,"彫刻的トラバーチンローテーブル": "Sculptural travertine coffee table"
  ,"黒染め真鍮サイドテーブル": "Blackened brass side table"
  ,"南壁ウォルナットコンソール": "South wall walnut console"
  ,"西窓際フィカス": "Ficus by the west windows"
  ,"6人掛けウォルナットダイニング": "Six-seat walnut dining table"
  ,"ダイニングチェア 北西": "Dining chair, northwest"
  ,"ダイニングチェア 北東": "Dining chair, northeast"
  ,"ダイニングチェア 南西": "Dining chair, southwest"
  ,"ダイニングチェア 南東": "Dining chair, southeast"
  ,"ダイニングチェア 西": "Dining chair, west"
  ,"ダイニングチェア 東": "Dining chair, east"
  ,"ダイニング背面ウォルナット収納": "Dining walnut credenza"
  ,"ダイニングのヤシ": "Dining palm"
  ,"木とモルタルのアイランド": "Walnut and mortar island"
  ,"ウォルナットアイランド天板": "Walnut island worktop"
  ,"トラバーチン壁付キッチン": "Travertine wall kitchen"
  ,"ウォルナットトール収納": "Walnut tall cabinet"
  ,"アイボリー冷蔵庫": "Ivory refrigerator"
  ,"コニャックカウンタースツール 西": "Cognac counter stool, west"
  ,"コニャックカウンタースツール 中央": "Cognac counter stool, center"
  ,"コニャックカウンタースツール 東": "Cognac counter stool, east"
  ,"キッチンの本と器のオープン棚": "Kitchen open shelf with books and ceramics"
  ,"黒染め真鍮レンジフード": "Blackened brass range hood"
  ,"南東の彫刻的モルタル階段": "Sculptural southeast mortar stair"
  ,"階段脇のウォルナットベンチ": "Walnut bench by the stair"
  ,"階段脇のストレリチア": "Bird of paradise by the stair"
  ,"南壁ギャラリーコンソール": "South wall gallery console"
  ,"テラコッタ抽象画 大": "Large terracotta abstract"
  ,"生成り抽象画 小": "Small natural linen abstract"
  ,"東壁の建築書本棚": "East wall architectural bookcase"
  ,"テラコッタ陶器 高": "Tall terracotta vessel"
  ,"トラバーチン陶器 低": "Low travertine vessel"
  ,"キッチン棚の陶器": "Kitchen shelf ceramic"
  ,"Bocci風クラスター 1": "Bocci-inspired cluster 1"
  ,"Bocci風クラスター 2": "Bocci-inspired cluster 2"
  ,"Bocci風クラスター 3": "Bocci-inspired cluster 3"
  ,"Bocci風クラスター 4": "Bocci-inspired cluster 4"
  ,"Bocci風クラスター 5": "Bocci-inspired cluster 5"
  ,"Bocci風クラスター 6": "Bocci-inspired cluster 6"
  ,"Bocci風クラスター 7": "Bocci-inspired cluster 7"
  ,"ダイニングペンダント 西": "Dining pendant, west"
  ,"ダイニングペンダント 東": "Dining pendant, east"
  ,"アイランドダウンライト 西": "Island downlight, west"
  ,"アイランドダウンライト 東": "Island downlight, east"
  ,"ギャラリーアートスポット 西": "Gallery art spotlight, west"
  ,"ギャラリーアートスポット 東": "Gallery art spotlight, east"
  ,"リビング彫刻スポット": "Living room sculpture spotlight"
  ,"Mole風ラウンジチェア 西": "Mole-inspired lounge chair, west"
  ,"Mole風ラウンジチェア 東": "Mole-inspired lounge chair, east"
  ,"南壁ウォルナットメディアユニット": "South walnut media unit"
  ,"薄いウォルナットメディア背面パネル": "Slim walnut media backing panel"
  ,"南壁壁掛けTV": "South wall-mounted TV"
  ,"東壁際の採光モルタル階段": "Daylit mortar stair by the east wall"
  ,"階段下のストレリチア": "Bird of paradise beneath the stairs"
  ,"南壁のテラコッタ抽象画": "Terracotta abstract art on south wall"
  ,"南壁大判アートスポット": "South-wall large-art spotlight"
  ,"メディア壁東端スポット": "Media-wall east-end spotlight"
  ,"デモの間取りを読み込みました。照明や家具を動かして部屋の雰囲気を試せます。": "Loaded the demo floor plan. Move lights and furniture to compare the room atmosphere."
  ,"自動保存データを読めませんでした。デモプロジェクトで起動しています。": "Could not read autosaved data. Starting with the demo project."
  ,"共有リンクのデモ間取りを読み込みますか？\nOK: デモを開く（作業中のプロジェクトはデモで上書き保存されます）\nキャンセル: 前回の続きを開く": "Open the demo floor plan from this shared link?\nOK: Open demo (your current project will be replaced in autosave)\nCancel: Continue your previous project"
  ,"デモデータを読み込めませんでした。通常どおり起動します。": "Could not load demo data. Starting normally."
  ,"前回のプロジェクトをIndexedDBから復元しました。": "Restored your previous project from IndexedDB."
  ,"IndexedDBへの自動保存に失敗しました。JSON保存を使ってください。": "Autosave to IndexedDB failed. Use JSON export to save your project."
  ,"間取り編集を開始しました。壁の選択・移動・削除ができます。": "Plan editing started. You can select, move, and delete walls."
  ,"間取り編集を終了しました。壁は誤操作防止のため選択できません。": "Plan editing ended. Walls cannot be selected to prevent accidental edits."
  ,"配置を終了しました。": "Placement finished."
  ,"選択を解除しました。": "Selection cleared."
  ,"選択中の要素を削除しました。": "Deleted the selected item."
  ,"下げ天井の下端高さをmmで入力してください。": "Enter the finished height below the dropped ceiling in mm."
  ,"設置したい壁をクリックしてください。Escで終了。": "Click the wall where you want to place it. Press Esc to finish."
  ,"配置したい位置をクリックしてください。配置後は選択してCmd+C / Cmd+Vで複製できます。": "Click where you want to place it. After placement, select it and use Cmd+C / Cmd+V to duplicate."
  ,"配置したい位置をクリックしてください。": "Click where you want to place it."
  ,"配置しました。選択してCmd+C / Cmd+Vで複製できます。": "Placed. Select it and use Cmd+C / Cmd+V to duplicate."
  ,"配置しました。選択後にドラッグで微調整できます。": "Placed. Select it and drag to fine-tune its position."
  ,"壁に設置しました。選択してCmd+C / Cmd+Vで複製できます。": "Placed on the wall. Select it and use Cmd+C / Cmd+V to duplicate."
  ,"壁に設置しました。選択後に壁上をドラッグして位置を調整できます。": "Placed on the wall. Select it and drag along the wall to adjust its position."
  ,"方位角": "Azimuth"
  ,"真下": "Down"
  ,"直下": "Straight down"
  ,"上向き": "Upward"
  ,"黄色の照射ポイントを3Dビュー上でも調整できます": "You can also adjust the yellow aim point in the 3D view."
  ,"床": "Floor"
  ,"机高": "Desk height"
  ,"照度ヒートマップ": "Illuminance heatmap"
  ,"明るさの目安": "Brightness guide"
  ,"床面に表示": "Show on floor"
  ,"色で表示": "Show in color"
  ,"確認する高さ": "Height to check"
  ,"表示範囲": "Display range"
  ,"計算状態": "Calculation status"
  ,"部屋の平均 / 最大": "Room average / maximum"
  ,"選んだ場所": "Selected location"
  ,"明るさを比べるための参考値です。実際の照度を保証するものではありません。": "A reference for comparing brightness. It does not guarantee actual illuminance."
  ,"表示": "Show"
  ,"計算面高さ": "Calculation plane"
  ,"スケール": "Scale"
  ,"間接光": "Indirect light"
  ,"計算完了": "Calculated"
  ,"計算中 {percent}%": "Calculating {percent}%"
  ,"表示の準備": "Display status"
  ,"停止中": "Stopped"
  ,"平均 / 最大": "Mean / max"
  ,"直接": "Direct"
  ,"間接": "Indirect"
  ,"クリック位置": "Clicked position"
  ,"合計": "Total"
  ,"実験的機能（参考値）: 配光はビーム角からの近似でIES配光ではありません。実照度(lux)を保証するものではありません。": "Experimental reference only: light distribution is approximated from beam angle, not IES data. It does not guarantee real illuminance (lux)."
  ,"IndexedDBに自動保存します。": "Autosaves to IndexedDB."
  ,"天井高をmmで入力してください。": "Enter ceiling height in mm."
  ,"{floor}の間取り図を読み込みました。{floor}の壁・窓・家具・照明・吹き抜けだけを削除して、まっさらな状態にしますか？\n（キャンセルすると既存のまま背景だけ読み込みます。Cmd+Zで元に戻せます）": "Loaded the {floor} floor plan. Delete only the walls, windows, furniture, lights, and double-height voids on {floor} to start with a blank plan?\n(Cancel keeps existing objects and imports only the background. You can undo with Cmd+Z.)"
  ,"1階基準で仮合わせしたので、背景合わせで位置を確認してください。": "Using temporary floor 1 alignment. Check the position with Align background."
  ,"{fileName} を{floor}背景に読み込み、{floor}の既存オブジェクトを削除しました。{alignmentNotice}": "Imported {fileName} as the {floor} background and deleted existing objects on {floor}.{alignmentNotice}"
  ,"{fileName} を{floor}の平面図背景として読み込みました。{alignmentNotice}": "Imported {fileName} as the {floor} plan background.{alignmentNotice}"
  ,"間取り図を読み込めませんでした。": "Could not import the floor plan."
  ,"{fileName} を読み込みました。": "Loaded {fileName}."
  ,"プロジェクトJSONの形式が不正です。読み込みを中止しました。": "The project JSON format is invalid. Import cancelled."
  ,"拡散ダウンライト": "Diffuse downlight"
  ,"中角ダウンライト": "Medium-beam downlight"
  ,"集光ダウンライト": "Narrow-beam downlight"
  ,"グレアレスダウンライト": "Glare-reduced downlight"
  ,"ユニバーサルダウンライト": "Adjustable downlight"
  ,"壁付スポット": "Wall spotlight"
  ,"テープライト(間接)": "Indirect tape light"
  ,"広角でやわらかく全体を照らす標準ダウンライト": "Standard downlight with a wide, soft spread."
  ,"一般的な配光のダウンライト": "Downlight with a typical beam spread."
  ,"床や対象を絞って照らす集光タイプ": "Narrow beam for highlighting the floor or a feature."
  ,"深枠で眩しさを抑えた上質な配光": "A deep recessed trim reduces glare."
  ,"首振りで照射方向を変えられるダウンライト": "Adjustable downlight that can be aimed."
  ,"壁面に取り付け、向きを変えられるスポット": "Wall-mounted spotlight with an adjustable aim."
  ,"ダイニング等に吊るす全方向光": "Omnidirectional pendant light for a dining area and more."
  ,"壁付の補助・アクセント照明": "Wall-mounted accent light."
  ,"棚下・壁裏の間接照明": "Indirect light for under shelves or behind walls."
  ,"テレビ": "TV"
  ,"デスク": "Desk"
  ,"洗濯機": "Washing machine"
  ,"洗面台": "Vanity"
  ,"トイレ": "Toilet"
  ,"浴槽": "Bathtub"
  ,"下駄箱": "Shoe cabinet"
  ,"汎用ボックス": "Generic box"
  ,"掃き出し窓": "Full-height window"
  ,"腰窓": "Sill-height window"
  ,"大開口窓": "Large opening window"
  ,"小窓": "Small window"
  ,"高窓（横長）": "Horizontal clerestory window"
  ,"開口（壁穴）": "Wall opening"
  ,"玄関扉": "Entry door"
  ,"勝手口": "Service door"
  ,"南": "South"
  ,"西": "West"
  ,"東": "East"
  ,"1階基準で仮合わせ（要確認）": "Temporarily aligned to floor 1 (review needed)"
  ,"実寸合わせ済み（{millimeters}mm基準）": "Calibrated to {millimeters} mm"
  ,"縮尺未設定（フィット表示）": "Scale not set (fit to view)"
  ,"背景なし": "No background"
  ,"編集（高速ラスター）": "Edit (fast raster)"
  ,"リアル（常駐パストレ）": "Realistic (live path tracing)"
  ,"間取り図画像を読み込めませんでした。": "Could not load the floor-plan image."
  ,"間取り図画像を圧縮するCanvasを作成できませんでした。": "Could not create a canvas to compress the floor-plan image."
  ,"PDFを描画するCanvasを作成できませんでした。": "Could not create a canvas to render the PDF."
  ,"LDK Lighting Lab - デモLDK": "LDK Lighting Lab - Demo LDK"
  ,"白系マットクロス": "White matte wall finish"
  ,"ライトグレーマットクロス": "Light gray matte wall finish"
  ,"ダークアクセントクロス": "Dark accent wall finish"
  ,"木目床": "Wood floor"
  ,"マットブラックキッチン": "Matte black kitchen"
  ,"石目ワークトップ": "Stone-look worktop"
  ,"ガラス": "Glass"
  ,"TV画面": "TV screen"
  ,"黒金属": "Black metal"
  ,"ウォームグレー布": "Warm gray fabric"
  ,"低彩度ラグ": "Muted rug"
  ,"TV背面壁": "TV feature wall"
  ,"階段側壁": "Stair-side wall"
  ,"掃き出し窓側壁": "Full-height window wall"
  ,"キッチン背面壁": "Kitchen back wall"
  ,"LDK掃き出し窓": "LDK full-height window"
  ,"階段・吹き抜け": "Stairs and double-height void"
  ,"丸ダイニングテーブル 1200": "Round dining table 1200"
  ,"ダイニングチェア 1": "Dining chair 1"
  ,"ダイニングチェア 2": "Dining chair 2"
  ,"ペニンシュラキッチン": "Peninsula kitchen"
  ,"リビングラグ": "Living-room rug"
  ,"65インチ壁掛けTV": "65-inch wall-mounted TV"
  ,"リビングダウンライト 1": "Living-room downlight 1"
  ,"リビングダウンライト 2": "Living-room downlight 2"
  ,"リビングダウンライト 3": "Living-room downlight 3"
  ,"キッチンダウンライト 1": "Kitchen downlight 1"
  ,"キッチンダウンライト 2": "Kitchen downlight 2"
  ,"キッチンダウンライト 3": "Kitchen downlight 3"
  ,"ダイニングペンダント": "Dining pendant"
  ,"階段ブラケット": "Stair wall light"
  ,"TV背面間接テープライト": "TV-back indirect tape light"
  ,"{name}（{state}）": "{name} ({state})"
};

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const initialLanguage = (): Language => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "ja" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const setLanguage = (nextLanguage: Language) => {
    localStorage.setItem(STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    const english = language === "en";
    document.title = english
      ? "LDK Lighting Lab — Compare home lighting in your floor plan"
      : "LDK Lighting Lab — 自分の間取りで照明を比較するシミュレーター";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      english
        ? "Compare home lighting layouts, brightness, color temperature, and room atmosphere in your floor plan before construction. This visual simulator does not guarantee real illuminance (lux)."
        : "自分の間取りを取り込み、照明の位置・明るさ・色温度を変えながら、照明による部屋の雰囲気をブラウザで比較できる無料ツール。インストール不要。※雰囲気比較用で実照度(lux)は保証しません。"
    );
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => {
      const translation = language === "en" ? (en[key] ?? key) : key;
      return Object.entries(values ?? {}).reduce(
        (message, [name, replacement]) => message.replaceAll(`{${name}}`, String(replacement)),
        translation
      );
    }
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within LanguageProvider");
  return value;
};
