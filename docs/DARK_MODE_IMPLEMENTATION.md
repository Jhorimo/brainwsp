# Modo oscuro: inventario y entrega

Alcance: panel y administración. Landing, login, registro, legales, widget público y Open Graph permanecen claros. Sidebar, logotipo, medios y bloques de código conservan sus colores de marca. No se modifica la API ni la base de datos.

## Inventario previo

CSS original: 1615 líneas. 291 literales distintos contando CSS y TSX; el conteo incluye vistas públicas, SVG y valores de configuración.

Las variantes numeradas mantienen las diferencias originales del tema claro. Se agrupan por función (superficie, borde, texto, sombra o decoración) y familia de estado. Los colores de marca/decoración no se invierten.

Tokens principales nuevos: `--brand-text`, `--on-color`, `--qr-bg`, `--topbar-bg`, `--input-bg`, `--overlay`, `--line-strong`. Las variantes `--surface-*`, `--border-*`, `--text-*` y `--shadow-*` se detallan abajo.

| Literal original | Usos | Referencias (hasta 3) |
| --- | ---: | --- |
| `#008300` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#063f93` | 2 | `apps/web/app/globals.css:9`, `apps/web/app/opengraph-image.tsx:32` |
| `#071a37` | 1 | `apps/web/app/globals.css:828` |
| `#0a5fc7` | 1 | `apps/web/app/globals.css:733` |
| `#0b1220` | 1 | `apps/web/app/globals.css:1186` |
| `#0c1830` | 1 | `apps/web/app/globals.css:811` |
| `#0d2348` | 1 | `apps/web/app/globals.css:807` |
| `#0d9488` | 2 | `apps/web/app/globals.css:1235`, `apps/web/app/globals.css:1328` |
| `#0e3474` | 1 | `apps/web/app/globals.css:828` |
| `#123d81` | 1 | `apps/web/app/globals.css:807` |
| `#168a55` | 4 | `apps/web/app/globals.css:14`, `apps/web/app/globals.css:389`, `apps/web/app/api-settings/page.tsx:139` |
| `#16a34a` | 5 | `apps/web/app/globals.css:1230`, `apps/web/app/globals.css:1257`, `apps/web/app/globals.css:1330` |
| `#172033` | 3 | `apps/web/app/globals.css:5`, `apps/web/app/globals.css:375`, `apps/web/app/globals.css:375` |
| `#17396d` | 1 | `apps/web/app/globals.css:114` |
| `#195ed0` | 3 | `apps/web/app/globals.css:239`, `apps/web/app/globals.css:301`, `apps/web/app/globals.css:321` |
| `#1a2f57` | 1 | `apps/web/app/globals.css:1060` |
| `#1a6b3f` | 2 | `apps/web/app/globals.css:1375`, `apps/web/app/globals.css:1377` |
| `#1baf7a` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#1c6fd1` | 1 | `apps/web/app/globals.css:589` |
| `#1c724d` | 1 | `apps/web/app/globals.css:110` |
| `#1e7a43` | 1 | `apps/web/app/globals.css:876` |
| `#1e8f52` | 3 | `apps/web/app/conversations/page.tsx:238`, `apps/web/app/conversations/page.tsx:239`, `apps/web/app/conversations/page.tsx:240` |
| `#1f8a43` | 1 | `apps/web/app/globals.css:793` |
| `#213786` | 6 | `apps/web/app/globals.css:8`, `apps/web/app/globals.css:77`, `apps/web/app/login/page.tsx:158` |
| `#2563eb` | 3 | `apps/web/app/globals.css:282`, `apps/web/app/globals.css:283`, `apps/web/app/dashboard/page.tsx:245` |
| `#25D366` | 2 | `apps/web/app/opengraph-image.tsx:19`, `apps/web/components/brand-mark.tsx:18` |
| `#276bd3` | 1 | `apps/web/app/globals.css:828` |
| `#2a78d6` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#2a80ea` | 1 | `apps/web/app/globals.css:732` |
| `#2c4f8f` | 1 | `apps/web/app/globals.css:1411` |
| `#2c7a4d` | 1 | `apps/web/app/globals.css:1376` |
| `#2dd4bf` | 2 | `apps/web/app/globals.css:1235`, `apps/web/app/globals.css:1328` |
| `#3467d6` | 2 | `apps/web/app/conversations/page.tsx:236`, `apps/web/app/conversations/page.tsx:237` |
| `#34A853` | 1 | `apps/web/components/google-icon.tsx:5` |
| `#3c86ff` | 2 | `apps/web/app/globals.css:10`, `apps/web/app/opengraph-image.tsx:32` |
| `#3ec6d6` | 1 | `apps/web/app/my-plan/page.tsx:102` |
| `#4285F4` | 1 | `apps/web/components/google-icon.tsx:4` |
| `#43a778` | 2 | `apps/web/app/globals.css:1551`, `apps/web/app/globals.css:1552` |
| `#486181` | 1 | `apps/web/app/globals.css:845` |
| `#4a3aa7` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#4ade80` | 3 | `apps/web/app/globals.css:1230`, `apps/web/app/globals.css:1257`, `apps/web/app/globals.css:1330` |
| `#4b8ef8` | 3 | `apps/web/app/globals.css:239`, `apps/web/app/globals.css:294`, `apps/web/app/globals.css:301` |
| `#4d5a70` | 1 | `apps/web/app/globals.css:471` |
| `#4d82d9` | 2 | `apps/web/app/globals.css:1551`, `apps/web/app/globals.css:1552` |
| `#53bdeb` | 1 | `apps/web/app/globals.css:630` |
| `#5b6478` | 1 | `apps/web/app/conversations/page.tsx:2410` |
| `#5c6b80` | 1 | `apps/web/app/conversations/page.tsx:245` |
| `#627087` | 5 | `apps/web/app/globals.css:128`, `apps/web/app/globals.css:143`, `apps/web/app/globals.css:146` |
| `#687da0` | 1 | `apps/web/app/globals.css:104` |
| `#6b4600` | 1 | `apps/web/app/globals.css:1383` |
| `#6b7280` | 1 | `apps/web/app/globals.css:1256` |
| `#6b7690` | 3 | `apps/web/app/login/page.tsx:157`, `apps/web/app/login/page.tsx:187`, `apps/web/app/register/page.tsx:213` |
| `#6b8afd` | 3 | `apps/web/app/conversations/page.tsx:325`, `apps/web/app/instances/page.tsx:268`, `apps/web/app/team/page.tsx:73` |
| `#6c7890` | 2 | `apps/web/app/globals.css:368`, `apps/web/app/globals.css:379` |
| `#6d28d9` | 1 | `apps/web/app/globals.css:1008` |
| `#748097` | 4 | `apps/web/app/globals.css:6`, `apps/web/app/calendar/page.tsx:30`, `apps/web/app/instances/page.tsx:183` |
| `#7749d1` | 2 | `apps/web/app/conversations/page.tsx:243`, `apps/web/app/conversations/page.tsx:244` |
| `#7797c5` | 2 | `apps/web/app/login/page.tsx:145`, `apps/web/app/register/page.tsx:136` |
| `#7a2a30` | 1 | `apps/web/app/globals.css:1614` |
| `#7b8aa0` | 2 | `apps/web/app/globals.css:639`, `apps/web/app/globals.css:743` |
| `#7c3aed` | 10 | `apps/web/app/globals.css:1006`, `apps/web/app/globals.css:1007`, `apps/web/app/globals.css:1232` |
| `#7d899c` | 1 | `apps/web/app/globals.css:350` |
| `#7e8da8` | 1 | `apps/web/app/globals.css:1552` |
| `#8299bb` | 1 | `apps/web/app/globals.css:118` |
| `#845b14` | 1 | `apps/web/app/globals.css:812` |
| `#8a5a06` | 1 | `apps/web/app/globals.css:1381` |
| `#8b97a9` | 2 | `apps/web/app/globals.css:359`, `apps/web/app/globals.css:760` |
| `#8b99ad` | 5 | `apps/web/app/globals.css:584`, `apps/web/app/globals.css:586`, `apps/web/app/globals.css:588` |
| `#8fa6ca` | 4 | `apps/web/app/globals.css:102`, `apps/web/app/globals.css:119`, `apps/web/app/globals.css:1604` |
| `#91a0b6` | 1 | `apps/web/app/globals.css:154` |
| `#92a0b5` | 1 | `apps/web/app/instances/page.tsx:274` |
| `#94a3b8` | 2 | `apps/web/components/app-shell.tsx:546`, `apps/web/components/app-shell.tsx:561` |
| `#98b8f6` | 1 | `apps/web/app/globals.css:473` |
| `#9aa6b7` | 1 | `apps/web/app/globals.css:549` |
| `#9aa7ba` | 2 | `apps/web/app/globals.css:335`, `apps/web/app/globals.css:337` |
| `#9ca3af` | 1 | `apps/web/app/globals.css:1256` |
| `#9dbbfb` | 16 | `apps/web/app/globals.css:197`, `apps/web/app/globals.css:217`, `apps/web/app/globals.css:223` |
| `#EA4335` | 1 | `apps/web/components/google-icon.tsx:7` |
| `#FBBC05` | 1 | `apps/web/components/google-icon.tsx:6` |
| `#a44249` | 1 | `apps/web/app/globals.css:399` |
| `#a78bfa` | 4 | `apps/web/app/globals.css:1232`, `apps/web/app/globals.css:1327`, `apps/web/app/globals.css:1335` |
| `#a7b2c8` | 1 | `apps/web/app/globals.css:47` |
| `#a9373f` | 3 | `apps/web/app/globals.css:875`, `apps/web/app/globals.css:1612`, `apps/web/app/globals.css:1615` |
| `#a9c0e3` | 3 | `apps/web/app/login/page.tsx:135`, `apps/web/app/opengraph-image.tsx:42`, `apps/web/app/register/page.tsx:126` |
| `#abc3e7` | 1 | `apps/web/app/globals.css:837` |
| `#aec5e8` | 1 | `apps/web/app/globals.css:809` |
| `#b30061` | 1 | `apps/web/app/globals.css:13` |
| `#b5690a` | 1 | `apps/web/app/globals.css:272` |
| `#b7c0cd` | 6 | `apps/web/app/globals.css:535`, `apps/web/app/globals.css:613`, `apps/web/app/globals.css:675` |
| `#b7c5dc` | 4 | `apps/web/app/globals.css:106`, `apps/web/app/globals.css:1429`, `apps/web/app/globals.css:1599` |
| `#b87108` | 1 | `apps/web/app/globals.css:16` |
| `#bcdcff` | 2 | `apps/web/app/globals.css:497`, `apps/web/app/globals.css:518` |
| `#bdf8d8` | 1 | `apps/web/app/globals.css:110` |
| `#bfe6c9` | 5 | `apps/web/app/globals.css:141`, `apps/web/app/globals.css:793`, `apps/web/app/globals.css:1166` |
| `#bfe6d2` | 1 | `apps/web/app/globals.css:384` |
| `#c2cbdb` | 2 | `apps/web/app/globals.css:43`, `apps/web/app/globals.css:46` |
| `#c4b5fd` | 2 | `apps/web/app/globals.css:1340`, `apps/web/app/globals.css:1343` |
| `#c4c9d4` | 1 | `apps/web/app/globals.css:1086` |
| `#c4d5ee` | 1 | `apps/web/app/globals.css:839` |
| `#c5d6ff` | 1 | `apps/web/app/globals.css:1550` |
| `#c7cfdc` | 1 | `apps/web/app/globals.css:522` |
| `#c7d6f0` | 1 | `apps/web/app/opengraph-image.tsx:48` |
| `#c93b43` | 2 | `apps/web/app/globals.css:18`, `apps/web/app/globals.css:1236` |
| `#c9dcfb` | 6 | `apps/web/app/globals.css:138`, `apps/web/app/globals.css:191`, `apps/web/app/globals.css:250` |
| `#cbd3df` | 1 | `apps/web/app/globals.css:133` |
| `#cdeed8` | 1 | `apps/web/app/globals.css:876` |
| `#d0e0f5` | 1 | `apps/web/app/globals.css:540` |
| `#d5e6fb` | 1 | `apps/web/app/globals.css:628` |
| `#d75c90` | 2 | `apps/web/app/globals.css:1551`, `apps/web/app/globals.css:1552` |
| `#d9702b` | 2 | `apps/web/app/conversations/page.tsx:241`, `apps/web/app/conversations/page.tsx:242` |
| `#d97706` | 3 | `apps/web/app/admin/clients/page.tsx:221`, `apps/web/app/dashboard/page.tsx:246`, `apps/web/components/app-shell.tsx:546` |
| `#dae4f5` | 1 | `apps/web/app/globals.css:884` |
| `#db2777` | 3 | `apps/web/app/globals.css:1234`, `apps/web/app/globals.css:1259`, `apps/web/app/globals.css:1326` |
| `#dbe6fb` | 3 | `apps/web/app/globals.css:294`, `apps/web/app/globals.css:302`, `apps/web/app/globals.css:322` |
| `#dbe7fb` | 2 | `apps/web/app/globals.css:1248`, `apps/web/app/globals.css:1283` |
| `#dbe8ff` | 1 | `apps/web/app/globals.css:845` |
| `#dc4a3a` | 1 | `apps/web/app/conversations/page.tsx:235` |
| `#dce9ff` | 1 | `apps/web/app/globals.css:811` |
| `#dcf5e4` | 1 | `apps/web/app/globals.css:1410` |
| `#ddd0fb` | 1 | `apps/web/app/globals.css:1007` |
| `#dde1ea` | 3 | `apps/web/app/conversations/page.tsx:2410`, `apps/web/app/dashboard/page.tsx:427`, `apps/web/app/dashboard/page.tsx:433` |
| `#dde9fd` | 1 | `apps/web/app/globals.css:139` |
| `#dfe5ee` | 3 | `apps/web/app/globals.css:472`, `apps/web/app/globals.css:626`, `apps/web/app/globals.css:634` |
| `#e18b43` | 2 | `apps/web/app/globals.css:1551`, `apps/web/app/globals.css:1552` |
| `#e2ecf9` | 1 | `apps/web/app/globals.css:540` |
| `#e34948` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#e3d9fb` | 3 | `apps/web/app/globals.css:1334`, `apps/web/app/globals.css:1338`, `apps/web/app/globals.css:1361` |
| `#e3e8f0` | 1 | `apps/web/app/globals.css:673` |
| `#e3e9f3` | 1 | `apps/web/app/globals.css:1552` |
| `#e3f1ff` | 2 | `apps/web/app/globals.css:497`, `apps/web/app/globals.css:518` |
| `#e3f4e9` | 3 | `apps/web/app/conversations/page.tsx:238`, `apps/web/app/conversations/page.tsx:239`, `apps/web/app/conversations/page.tsx:240` |
| `#e4007c` | 1 | `apps/web/app/globals.css:12` |
| `#e5edfb` | 2 | `apps/web/app/conversations/page.tsx:236`, `apps/web/app/conversations/page.tsx:237` |
| `#e7ebf1` | 3 | `apps/web/app/globals.css:406`, `apps/web/app/globals.css:578`, `apps/web/app/globals.css:609` |
| `#e7ebf2` | 1 | `apps/web/app/globals.css:7` |
| `#e87ba4` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#e8f2ff` | 1 | `apps/web/app/globals.css:628` |
| `#e8f7ef` | 1 | `apps/web/app/globals.css:15` |
| `#e8f8ef` | 1 | `apps/web/app/globals.css:389` |
| `#e9f1fb` | 1 | `apps/web/app/globals.css:11` |
| `#ea580c` | 3 | `apps/web/app/globals.css:1233`, `apps/web/app/globals.css:1258`, `apps/web/app/globals.css:1329` |
| `#eab3b8` | 1 | `apps/web/app/globals.css:529` |
| `#eaf7ee` | 1 | `apps/web/app/globals.css:793` |
| `#eb6834` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#ebeef2` | 2 | `apps/web/app/globals.css:743`, `apps/web/app/conversations/page.tsx:245` |
| `#ece5fc` | 1 | `apps/web/app/globals.css:1342` |
| `#eda100` | 1 | `apps/web/app/calendar/page.tsx:29` |
| `#edf0f5` | 1 | `apps/web/app/globals.css:998` |
| `#eef1f5` | 10 | `apps/web/app/globals.css:368`, `apps/web/app/globals.css:379`, `apps/web/app/globals.css:416` |
| `#eef1f6` | 3 | `apps/web/app/globals.css:158`, `apps/web/app/globals.css:171`, `apps/web/app/globals.css:237` |
| `#eef1f7` | 1 | `apps/web/app/conversations/page.tsx:2410` |
| `#efe6fe` | 4 | `apps/web/app/globals.css:1006`, `apps/web/app/globals.css:1008`, `apps/web/app/globals.css:1336` |
| `#efeae2` | 1 | `apps/web/app/globals.css:576` |
| `#eff2f6` | 8 | `apps/web/app/globals.css:166`, `apps/web/app/globals.css:351`, `apps/web/app/globals.css:393` |
| `#f0eafb` | 2 | `apps/web/app/conversations/page.tsx:243`, `apps/web/app/conversations/page.tsx:244` |
| `#f0f2f6` | 7 | `apps/web/app/globals.css:324`, `apps/web/app/globals.css:533`, `apps/web/app/globals.css:1116` |
| `#f0f5ff` | 2 | `apps/web/app/globals.css:326`, `apps/web/app/globals.css:845` |
| `#f0fbf3` | 1 | `apps/web/app/globals.css:876` |
| `#f1c9cc` | 5 | `apps/web/app/globals.css:136`, `apps/web/app/globals.css:361`, `apps/web/app/globals.css:528` |
| `#f1d0d3` | 2 | `apps/web/app/globals.css:875`, `apps/web/app/globals.css:1612` |
| `#f1f4fa` | 1 | `apps/web/app/globals.css:451` |
| `#f2d7d9` | 1 | `apps/web/app/globals.css:399` |
| `#f2f5fa` | 3 | `apps/web/app/globals.css:642`, `apps/web/app/globals.css:647`, `apps/web/app/globals.css:703` |
| `#f3e2bb` | 2 | `apps/web/app/globals.css:381`, `apps/web/app/globals.css:812` |
| `#f3f5f8` | 1 | `apps/web/app/globals.css:764` |
| `#f3f7ff` | 1 | `apps/web/app/globals.css:191` |
| `#f472b6` | 3 | `apps/web/app/globals.css:1234`, `apps/web/app/globals.css:1259`, `apps/web/app/globals.css:1326` |
| `#f4f7fb` | 1 | `apps/web/app/globals.css:2` |
| `#f5f0fe` | 1 | `apps/web/app/globals.css:1007` |
| `#f5f6f8` | 3 | `apps/web/app/globals.css:1179`, `apps/web/app/globals.css:1183`, `apps/web/app/globals.css:1366` |
| `#f5f8ff` | 1 | `apps/web/app/globals.css:534` |
| `#f6cdd0` | 1 | `apps/web/app/globals.css:186` |
| `#f6f2ff` | 1 | `apps/web/app/globals.css:1338` |
| `#f7f9fc` | 2 | `apps/web/app/globals.css:551`, `apps/web/app/globals.css:1026` |
| `#f7f9fd` | 2 | `apps/web/app/globals.css:1546`, `apps/web/app/globals.css:1551` |
| `#f7faff` | 1 | `apps/web/app/globals.css:539` |
| `#f87171` | 1 | `apps/web/app/globals.css:1236` |
| `#f8fafc` | 1 | `apps/web/app/globals.css:4` |
| `#f8faff` | 1 | `apps/web/app/globals.css:1015` |
| `#f9fbfd` | 2 | `apps/web/app/globals.css:350`, `apps/web/app/globals.css:1106` |
| `#fb923c` | 3 | `apps/web/app/globals.css:1233`, `apps/web/app/globals.css:1258`, `apps/web/app/globals.css:1329` |
| `#fbe7e5` | 1 | `apps/web/app/conversations/page.tsx:235` |
| `#fbfcfe` | 3 | `apps/web/app/globals.css:133`, `apps/web/app/globals.css:840`, `apps/web/app/globals.css:998` |
| `#fcebe0` | 2 | `apps/web/app/conversations/page.tsx:241`, `apps/web/app/conversations/page.tsx:242` |
| `#fdecec` | 1 | `apps/web/app/globals.css:529` |
| `#fdeced` | 1 | `apps/web/app/globals.css:780` |
| `#ffd9dc` | 2 | `apps/web/app/globals.css:1238`, `apps/web/app/globals.css:1276` |
| `#ffe3ab` | 1 | `apps/web/app/globals.css:81` |
| `#ffe6ad` | 1 | `apps/web/app/globals.css:1381` |
| `#fff` | 17 | `apps/web/app/globals.css:77`, `apps/web/app/globals.css:82`, `apps/web/app/globals.css:107` |
| `#fff0f1` | 3 | `apps/web/app/globals.css:19`, `apps/web/app/globals.css:875`, `apps/web/app/globals.css:1612` |
| `#fff3e0` | 1 | `apps/web/app/globals.css:272` |
| `#fff5df` | 1 | `apps/web/app/globals.css:17` |
| `#fff5f0` | 1 | `apps/web/app/globals.css:186` |
| `#fff5f5` | 1 | `apps/web/app/globals.css:528` |
| `#fff6f7` | 1 | `apps/web/app/globals.css:399` |
| `#fff8e9` | 1 | `apps/web/app/globals.css:812` |
| `#fffafa` | 2 | `apps/web/app/globals.css:136`, `apps/web/app/globals.css:361` |
| `#ffffff` | 2 | `apps/web/app/globals.css:3`, `apps/web/app/globals.css:1338` |
| `black` | 6 | `apps/web/app/globals.css:1457`, `apps/web/app/globals.css:1458`, `apps/web/app/globals.css:1468` |
| `rgba(0,0,0,.04)` | 1 | `apps/web/app/globals.css:593` |
| `rgba(0,0,0,.06)` | 1 | `apps/web/app/globals.css:579` |
| `rgba(0,0,0,.08)` | 1 | `apps/web/app/globals.css:782` |
| `rgba(0,0,0,.15)` | 1 | `apps/web/app/globals.css:675` |
| `rgba(0,0,0,.22)` | 1 | `apps/web/app/globals.css:402` |
| `rgba(0,0,0,.3)` | 1 | `apps/web/app/globals.css:952` |
| `rgba(0,0,0,.4)` | 1 | `apps/web/app/globals.css:728` |
| `rgba(0,0,0,.5)` | 1 | `apps/web/app/globals.css:1190` |
| `rgba(0,0,0,.55)` | 1 | `apps/web/app/globals.css:1188` |
| `rgba(10, 20, 40, .22)` | 1 | `apps/web/app/globals.css:897` |
| `rgba(10,14,24,.86)` | 1 | `apps/web/app/globals.css:727` |
| `rgba(10,20,40,.45)` | 2 | `apps/web/app/globals.css:900`, `apps/web/app/globals.css:960` |
| `rgba(15, 25, 45, .28)` | 1 | `apps/web/app/globals.css:311` |
| `rgba(15,23,42,.55)` | 2 | `apps/web/app/globals.css:725`, `apps/web/app/globals.css:737` |
| `rgba(169, 55, 63, .22)` | 1 | `apps/web/app/globals.css:1612` |
| `rgba(174,246,207,.14)` | 1 | `apps/web/app/globals.css:110` |
| `rgba(19, 99, 211, 0.4)` | 1 | `apps/web/app/globals.css:108` |
| `rgba(20, 42, 80, 0.08)` | 1 | `apps/web/app/globals.css:20` |
| `rgba(20,30,60,.1)` | 1 | `apps/web/app/globals.css:1245` |
| `rgba(20,30,60,.15)` | 1 | `apps/web/app/globals.css:1162` |
| `rgba(20,42,80,.04)` | 1 | `apps/web/app/globals.css:1104` |
| `rgba(20,42,80,.06)` | 1 | `apps/web/app/globals.css:1122` |
| `rgba(20,42,80,.08)` | 1 | `apps/web/app/globals.css:1577` |
| `rgba(20,42,80,.1)` | 3 | `apps/web/app/globals.css:1520`, `apps/web/app/globals.css:1532`, `apps/web/app/globals.css:1541` |
| `rgba(20,42,80,.12)` | 3 | `apps/web/app/globals.css:1127`, `apps/web/app/globals.css:1500`, `apps/web/app/globals.css:1558` |
| `rgba(20,42,80,.14)` | 2 | `apps/web/app/globals.css:855`, `apps/web/app/globals.css:866` |
| `rgba(20,42,80,.22)` | 1 | `apps/web/app/globals.css:1312` |
| `rgba(228, 0, 124, .22)` | 1 | `apps/web/app/globals.css:134` |
| `rgba(228,0,124,${(1 - distm / MOUSE_DIST)` | 1 | `apps/web/app/page.tsx:242` |
| `rgba(228,0,124,.07)` | 1 | `apps/web/app/globals.css:1466` |
| `rgba(228,0,124,.14)` | 1 | `apps/web/app/globals.css:1559` |
| `rgba(228,0,124,.22)` | 2 | `apps/web/app/globals.css:1549`, `apps/web/app/globals.css:1560` |
| `rgba(228,0,124,.32)` | 1 | `apps/web/app/globals.css:1504` |
| `rgba(228,0,124,.35)` | 2 | `apps/web/app/globals.css:1436`, `apps/web/app/globals.css:1562` |
| `rgba(228,0,124,0)` | 1 | `apps/web/app/globals.css:1562` |
| `rgba(255,255,255,.018)` | 1 | `apps/web/app/globals.css:829` |
| `rgba(255,255,255,.025)` | 1 | `apps/web/app/globals.css:829` |
| `rgba(255,255,255,.05)` | 3 | `apps/web/app/globals.css:113`, `apps/web/app/globals.css:120`, `apps/web/app/globals.css:839` |
| `rgba(255,255,255,.06)` | 2 | `apps/web/app/globals.css:107`, `apps/web/app/globals.css:1434` |
| `rgba(255,255,255,.07)` | 1 | `apps/web/app/globals.css:1418` |
| `rgba(255,255,255,.08)` | 2 | `apps/web/app/globals.css:810`, `apps/web/app/globals.css:829` |
| `rgba(255,255,255,.09)` | 1 | `apps/web/app/globals.css:84` |
| `rgba(255,255,255,.1)` | 2 | `apps/web/app/globals.css:1419`, `apps/web/app/globals.css:1605` |
| `rgba(255,255,255,.12)` | 2 | `apps/web/app/globals.css:729`, `apps/web/app/globals.css:839` |
| `rgba(255,255,255,.14)` | 1 | `apps/web/app/opengraph-image.tsx:37` |
| `rgba(255,255,255,.18)` | 2 | `apps/web/app/globals.css:810`, `apps/web/app/globals.css:1433` |
| `rgba(255,255,255,.22)` | 1 | `apps/web/app/globals.css:730` |
| `rgba(255,255,255,.4)` | 1 | `apps/web/app/globals.css:1434` |
| `rgba(255,255,255,.55)` | 1 | `apps/web/app/globals.css:596` |
| `rgba(255,255,255,.75)` | 1 | `apps/web/app/globals.css:1061` |
| `rgba(255,255,255,.88)` | 1 | `apps/web/app/globals.css:123` |
| `rgba(29, 55, 204, 0.09)` | 1 | `apps/web/app/globals.css:111` |
| `rgba(3,14,35,.56)` | 1 | `apps/web/app/globals.css:401` |
| `rgba(31,47,76,.035)` | 3 | `apps/web/app/globals.css:149`, `apps/web/app/globals.css:387`, `apps/web/app/globals.css:1389` |
| `rgba(31,47,76,.04)` | 1 | `apps/web/app/globals.css:478` |
| `rgba(31,47,76,.05)` | 1 | `apps/web/app/globals.css:1032` |
| `rgba(31,47,76,.06)` | 1 | `apps/web/app/globals.css:1165` |
| `rgba(31,47,76,.1)` | 2 | `apps/web/app/globals.css:1228`, `apps/web/app/globals.css:1323` |
| `rgba(31,47,76,.18)` | 3 | `apps/web/app/globals.css:553`, `apps/web/app/globals.css:584`, `apps/web/app/globals.css:586` |
| `rgba(31,47,76,.25)` | 10 | `apps/web/app/globals.css:500`, `apps/web/app/globals.css:519`, `apps/web/app/globals.css:610` |
| `rgba(31,55,100,.09)` | 1 | `apps/web/app/globals.css:1552` |
| `rgba(33,55,134,.055)` | 2 | `apps/web/app/globals.css:1454`, `apps/web/app/globals.css:1455` |
| `rgba(33,55,134,.15)` | 1 | `apps/web/app/globals.css:1551` |
| `rgba(33,55,134,.28)` | 1 | `apps/web/app/globals.css:1550` |
| `rgba(33,55,134,.55)` | 1 | `apps/web/app/page.tsx:253` |
| `rgba(33,55,134,.94)` | 1 | `apps/web/app/globals.css:1418` |
| `rgba(33,55,134,X)` | 1 | `apps/web/app/globals.css:1416` |
| `rgba(37, 99, 235, .08)` | 1 | `apps/web/app/globals.css:552` |
| `rgba(37, 99, 235, .12)` | 1 | `apps/web/app/globals.css:281` |
| `rgba(37,99,235,.08)` | 1 | `apps/web/app/globals.css:608` |
| `rgba(37,99,235,.4)` | 1 | `apps/web/app/globals.css:608` |
| `rgba(37,99,235,.45)` | 1 | `apps/web/app/globals.css:283` |
| `rgba(37,99,235,.5)` | 1 | `apps/web/app/globals.css:601` |
| `rgba(37,99,235,0)` | 1 | `apps/web/app/globals.css:602` |
| `rgba(38,53,76,.03)` | 1 | `apps/web/app/globals.css:578` |
| `rgba(38,53,76,.12)` | 1 | `apps/web/app/globals.css:609` |
| `rgba(60,134,255,${(1 - dist / LINK_DIST)` | 1 | `apps/web/app/page.tsx:232` |
| `rgba(60,134,255,.08)` | 1 | `apps/web/app/globals.css:1431` |
| `rgba(60,134,255,.10)` | 1 | `apps/web/app/globals.css:1465` |
| `rgba(60,134,255,.28)` | 1 | `apps/web/app/globals.css:1530` |
| `rgba(60,134,255,.3)` | 2 | `apps/web/app/globals.css:1541`, `apps/web/app/globals.css:1549` |
| `rgba(60,134,255,.32)` | 2 | `apps/web/app/globals.css:1520`, `apps/web/app/globals.css:1576` |
| `rgba(60,134,255,.35)` | 1 | `apps/web/app/globals.css:1552` |
| `rgba(60,134,255,.4)` | 2 | `apps/web/app/globals.css:1500`, `apps/web/app/globals.css:1577` |
| `rgba(60,134,255,.45)` | 1 | `apps/web/app/globals.css:1431` |
| `rgba(8, 85, 196, .3)` | 1 | `apps/web/app/globals.css:99` |
| `rgba(8,20,55,.28)` | 1 | `apps/web/app/globals.css:1419` |
| `rgba(8,85,196,.08)` | 2 | `apps/web/app/globals.css:334`, `apps/web/app/globals.css:473` |
| `rgba(8,85,196,.16)` | 1 | `apps/web/app/globals.css:108` |
| `rgba(8,85,196,.25)` | 1 | `apps/web/app/globals.css:1533` |
| `white` | 152 | `apps/web/app/globals.css:108`, `apps/web/app/globals.css:112`, `apps/web/app/globals.css:116` |

## Tokens de presentación

Valores finales. Las variantes numéricas conservan matices del CSS original para no alterar el tema claro; los prefijos indican su función. `--fixed-*` conserva colores de marca, vistas públicas y medios.

| Token | Claro | Oscuro (hereda claro si no cambia) |
| --- | --- | --- |
| `--accent` | `#e4007c` | `#e4007c` |
| `--accent-dark` | `#b30061` | `#b30061` |
| `--accent-text` | `#e4007c` | `#ff92cb` |
| `--bg` | `#f4f7fb` | `#0f1420` |
| `--border-danger-1` | `#f1c9cc` | `#74404b` |
| `--border-danger-2` | `#f6cdd0` | `#74404b` |
| `--border-danger-3` | `#eab3b8` | `#74404b` |
| `--border-danger-4` | `#f1d0d3` | `#74404b` |
| `--border-danger-5` | `#ffd9dc` | `#74404b` |
| `--border-info-1` | `#c9dcfb` | `#405e8c` |
| `--border-info-2` | `#9dbbfb` | `#405e8c` |
| `--border-info-3` | `#98b8f6` | `#405e8c` |
| `--border-info-4` | `#bcdcff` | `#405e8c` |
| `--border-info-5` | `rgba(37,99,235,.4)` | `#405e8c` |
| `--border-info-6` | `#d5e6fb` | `#405e8c` |
| `--border-info-7` | `#ddd0fb` | `#405e8c` |
| `--border-info-8` | `#e3d9fb` | `#405e8c` |
| `--border-neutral-1` | `#c2cbdb` | `#41516a` |
| `--border-neutral-10` | `#e7ebf1` | `#41516a` |
| `--border-neutral-11` | `#f3f5f8` | `#41516a` |
| `--border-neutral-12` | `rgba(0,0,0,.08)` | `#41516a` |
| `--border-neutral-13` | `#dae4f5` | `#41516a` |
| `--border-neutral-14` | `#edf0f5` | `#41516a` |
| `--border-neutral-15` | `#f5f6f8` | `#41516a` |
| `--border-neutral-16` | `#dde1ea` | `#41516a` |
| `--border-neutral-2` | `#cbd3df` | `#41516a` |
| `--border-neutral-3` | `#eff2f6` | `#41516a` |
| `--border-neutral-4` | `#f0f2f6` | `#41516a` |
| `--border-neutral-5` | `#172033` | `#41516a` |
| `--border-neutral-6` | `#f2d7d9` | `#41516a` |
| `--border-neutral-7` | `#eef1f5` | `#41516a` |
| `--border-neutral-8` | `#dfe5ee` | `#41516a` |
| `--border-neutral-9` | `#c7cfdc` | `#41516a` |
| `--border-success-1` | `#bfe6c9` | `#386b56` |
| `--border-success-2` | `#bfe6d2` | `#386b56` |
| `--border-success-3` | `#cdeed8` | `#386b56` |
| `--border-warning-1` | `#ffe3ab` | `#79613a` |
| `--border-warning-2` | `#f3e2bb` | `#79613a` |
| `--border-warning-3` | `#ffe6ad` | `#79613a` |
| `--brand` | `#213786` | `#213786` |
| `--brand-dark` | `#063f93` | `#063f93` |
| `--brand-light` | `#3c86ff` | `#3c86ff` |
| `--brand-soft` | `#e9f1fb` | `#1d2e49` |
| `--brand-text` | `#213786` | `#a8cbff` |
| `--calendar-agent-1` | `#2a78d6` | `#8bbcff` |
| `--calendar-agent-2` | `#eb6834` | `#ffb17f` |
| `--calendar-agent-3` | `#1baf7a` | `#72dfc0` |
| `--calendar-agent-4` | `#eda100` | `#f6d677` |
| `--calendar-agent-5` | `#e87ba4` | `#ffacd4` |
| `--calendar-agent-6` | `#008300` | `#a6df82` |
| `--calendar-agent-7` | `#4a3aa7` | `#c3b0ff` |
| `--calendar-agent-8` | `#e34948` | `#ff9eaa` |
| `--chart-outbound` | `#dbe6fb` | `#7ba6e8` |
| `--chart-rank` | `#213786` | `#8bbcff` |
| `--chat-outgoing-bg` | `#e8f2ff` | `#1d3655` |
| `--chat-outgoing-border` | `#d5e6fb` | `#41678e` |
| `--danger` | `#c93b43` | `#c93b43` |
| `--danger-soft` | `#fff0f1` | `#35202a` |
| `--danger-text` | `#c93b43` | `#ffb4be` |
| `--decoration-danger-1` | `#f87171` | `#f87171` |
| `--decoration-danger-2` | `#c93b43` | `#c93b43` |
| `--decoration-danger-3` | `#a9373f` | `#a9373f` |
| `--decoration-info-1` | `#4b8ef8` | `#4b8ef8` |
| `--decoration-info-2` | `#195ed0` | `#195ed0` |
| `--decoration-info-3` | `#2563eb` | `#2563eb` |
| `--decoration-info-4` | `#7c3aed` | `#7c3aed` |
| `--decoration-info-5` | `#2dd4bf` | `#2dd4bf` |
| `--decoration-info-6` | `#0d9488` | `#0d9488` |
| `--decoration-neutral-1` | `#a7b2c8` | `#a7b2c8` |
| `--decoration-neutral-2` | `#172033` | `#172033` |
| `--decoration-neutral-3` | `#9ca3af` | `#9ca3af` |
| `--decoration-neutral-4` | `#6b7280` | `#6b7280` |
| `--decoration-pink-1` | `#f472b6` | `#f472b6` |
| `--decoration-pink-2` | `#db2777` | `#db2777` |
| `--decoration-success-1` | `#4ade80` | `#4ade80` |
| `--decoration-success-2` | `#16a34a` | `#16a34a` |
| `--decoration-warning-1` | `#fb923c` | `#fb923c` |
| `--decoration-warning-2` | `#ea580c` | `#ea580c` |
| `--doc-archive-bg` | `#f0eafb` | `#2d2542` |
| `--doc-pdf-bg` | `#fbe7e5` | `#35202a` |
| `--doc-sheet-bg` | `#e3f4e9` | `#19322c` |
| `--doc-slides-bg` | `#fcebe0` | `#332a1c` |
| `--doc-word-bg` | `#e5edfb` | `#1d2e49` |
| `--fixed-info-1` | `#213786` | `#213786` |
| `--fixed-info-10` | `#123d81` | `#123d81` |
| `--fixed-info-11` | `#aec5e8` | `#aec5e8` |
| `--fixed-info-12` | `#0c1830` | `#0c1830` |
| `--fixed-info-13` | `#dce9ff` | `#dce9ff` |
| `--fixed-info-14` | `#276bd3` | `#276bd3` |
| `--fixed-info-15` | `#0e3474` | `#0e3474` |
| `--fixed-info-16` | `#071a37` | `#071a37` |
| `--fixed-info-17` | `#abc3e7` | `#abc3e7` |
| `--fixed-info-18` | `#c4d5ee` | `#c4d5ee` |
| `--fixed-info-19` | `#dbe8ff` | `#dbe8ff` |
| `--fixed-info-2` | `#8fa6ca` | `#8fa6ca` |
| `--fixed-info-20` | `#486181` | `#486181` |
| `--fixed-info-21` | `rgba(33,55,134,.94)` | `rgba(33,55,134,.94)` |
| `--fixed-info-22` | `rgba(60,134,255,.45)` | `rgba(60,134,255,.45)` |
| `--fixed-info-23` | `rgba(60,134,255,.08)` | `rgba(60,134,255,.08)` |
| `--fixed-info-24` | `rgba(33,55,134,.055)` | `rgba(33,55,134,.055)` |
| `--fixed-info-25` | `rgba(60,134,255,.10)` | `rgba(60,134,255,.10)` |
| `--fixed-info-26` | `rgba(60,134,255,.4)` | `rgba(60,134,255,.4)` |
| `--fixed-info-27` | `rgba(60,134,255,.32)` | `rgba(60,134,255,.32)` |
| `--fixed-info-28` | `rgba(60,134,255,.28)` | `rgba(60,134,255,.28)` |
| `--fixed-info-29` | `rgba(60,134,255,.3)` | `rgba(60,134,255,.3)` |
| `--fixed-info-3` | `#b7c5dc` | `#b7c5dc` |
| `--fixed-info-30` | `#c5d6ff` | `#c5d6ff` |
| `--fixed-info-31` | `#4d82d9` | `#4d82d9` |
| `--fixed-info-32` | `rgba(60,134,255,.35)` | `rgba(60,134,255,.35)` |
| `--fixed-info-4` | `rgba(19, 99, 211, 0.4)` | `rgba(19, 99, 211, 0.4)` |
| `--fixed-info-5` | `rgba(8,85,196,.16)` | `rgba(8,85,196,.16)` |
| `--fixed-info-6` | `rgba(29, 55, 204, 0.09)` | `rgba(29, 55, 204, 0.09)` |
| `--fixed-info-7` | `#17396d` | `#17396d` |
| `--fixed-info-8` | `#8299bb` | `#8299bb` |
| `--fixed-info-9` | `#0d2348` | `#0d2348` |
| `--fixed-neutral-1` | `rgba(255,255,255,.09)` | `rgba(255,255,255,.09)` |
| `--fixed-neutral-10` | `rgba(255,255,255,.22)` | `rgba(255,255,255,.22)` |
| `--fixed-neutral-11` | `rgba(255,255,255,.18)` | `rgba(255,255,255,.18)` |
| `--fixed-neutral-12` | `rgba(255,255,255,.08)` | `rgba(255,255,255,.08)` |
| `--fixed-neutral-13` | `#fbfcfe` | `#fbfcfe` |
| `--fixed-neutral-14` | `#f0f5ff` | `#f0f5ff` |
| `--fixed-neutral-15` | `#0b1220` | `#0b1220` |
| `--fixed-neutral-16` | `rgba(0,0,0,.55)` | `rgba(0,0,0,.55)` |
| `--fixed-neutral-17` | `rgba(255,255,255,.07)` | `rgba(255,255,255,.07)` |
| `--fixed-neutral-18` | `rgba(255,255,255,.1)` | `rgba(255,255,255,.1)` |
| `--fixed-neutral-19` | `rgba(255,255,255,.4)` | `rgba(255,255,255,.4)` |
| `--fixed-neutral-2` | `#687da0` | `#687da0` |
| `--fixed-neutral-20` | `black` | `black` |
| `--fixed-neutral-21` | `#f7f9fd` | `#f7f9fd` |
| `--fixed-neutral-22` | `#e3e9f3` | `#e3e9f3` |
| `--fixed-neutral-23` | `#fff` | `#fff` |
| `--fixed-neutral-24` | `#7e8da8` | `#7e8da8` |
| `--fixed-neutral-3` | `rgba(255,255,255,.06)` | `rgba(255,255,255,.06)` |
| `--fixed-neutral-4` | `rgba(255,255,255,.05)` | `rgba(255,255,255,.05)` |
| `--fixed-neutral-5` | `white` | `white` |
| `--fixed-neutral-7` | `rgba(15,23,42,.55)` | `rgba(15,23,42,.55)` |
| `--fixed-neutral-8` | `rgba(10,14,24,.86)` | `rgba(10,14,24,.86)` |
| `--fixed-neutral-9` | `rgba(255,255,255,.12)` | `rgba(255,255,255,.12)` |
| `--fixed-pink-1` | `rgba(228,0,124,.07)` | `rgba(228,0,124,.07)` |
| `--fixed-pink-2` | `rgba(228,0,124,.22)` | `rgba(228,0,124,.22)` |
| `--fixed-pink-3` | `#d75c90` | `#d75c90` |
| `--fixed-success-1` | `#1c724d` | `#1c724d` |
| `--fixed-success-2` | `#bdf8d8` | `#bdf8d8` |
| `--fixed-success-3` | `rgba(174,246,207,.14)` | `rgba(174,246,207,.14)` |
| `--fixed-success-4` | `#43a778` | `#43a778` |
| `--fixed-warning-1` | `#e18b43` | `#e18b43` |
| `--input-bg` | `var(--surface)` | `var(--surface)` |
| `--line` | `#e7ebf2` | `#334157` |
| `--line-strong` | `#cbd3df` | `#53647e` |
| `--muted` | `#748097` | `#a8b4c8` |
| `--on-color` | `#ffffff` | `#ffffff` |
| `--overlay` | `rgba(3,14,35,.56)` | `rgba(3,10,22,.72)` |
| `--qr-bg` | `#ffffff` | `#ffffff` |
| `--shadow` | `0 12px 32px rgba(20, 42, 80, 0.08)` | `0 8px 24px rgba(0, 0, 0, .18)` |
| `--shadow-danger-1` | `rgba(169, 55, 63, .22)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-1` | `rgba(8, 85, 196, .3)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-10` | `rgba(37,99,235,0)` | `rgba(37,99,235,0)` |
| `--shadow-info-11` | `rgba(38,53,76,.12)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-12` | `rgba(20,42,80,.14)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-13` | `rgba(31,47,76,.05)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-14` | `rgba(20,42,80,.04)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-15` | `rgba(20,42,80,.06)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-16` | `rgba(20,42,80,.12)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-17` | `rgba(20,30,60,.15)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-18` | `rgba(31,47,76,.06)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-19` | `rgba(31,47,76,.1)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-2` | `rgba(31,47,76,.035)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-20` | `rgba(20,30,60,.1)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-21` | `rgba(20,42,80,.22)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-22` | `rgba(8,20,55,.28)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-23` | `rgba(20,42,80,.1)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-24` | `rgba(8,85,196,.25)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-25` | `rgba(33,55,134,.28)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-26` | `rgba(33,55,134,.15)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-27` | `rgba(31,55,100,.09)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-28` | `rgba(20,42,80,.08)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-3` | `rgba(37,99,235,.45)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-4` | `rgba(8,85,196,.08)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-5` | `rgba(31,47,76,.04)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-6` | `rgba(31,47,76,.25)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-7` | `rgba(31,47,76,.18)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-8` | `rgba(38,53,76,.03)` | `rgba(0, 0, 0, .18)` |
| `--shadow-info-9` | `rgba(37,99,235,.5)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-1` | `rgba(15, 25, 45, .28)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-2` | `rgba(0,0,0,.22)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-3` | `rgba(0,0,0,.15)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-4` | `rgba(0,0,0,.4)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-5` | `rgba(255,255,255,.025)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-6` | `rgba(255,255,255,.018)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-7` | `rgba(10, 20, 40, .22)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-8` | `rgba(0,0,0,.3)` | `rgba(0, 0, 0, .18)` |
| `--shadow-neutral-9` | `rgba(0,0,0,.5)` | `rgba(0, 0, 0, .18)` |
| `--shadow-pink-1` | `rgba(228, 0, 124, .22)` | `rgba(0, 0, 0, .18)` |
| `--shadow-pink-2` | `rgba(228,0,124,.35)` | `rgba(0, 0, 0, .18)` |
| `--shadow-pink-3` | `rgba(228,0,124,.32)` | `rgba(0, 0, 0, .18)` |
| `--shadow-pink-4` | `rgba(228,0,124,.14)` | `rgba(0, 0, 0, .18)` |
| `--shadow-pink-5` | `rgba(228,0,124,.22)` | `rgba(0, 0, 0, .18)` |
| `--shadow-pink-6` | `rgba(228,0,124,0)` | `rgba(228,0,124,0)` |
| `--stage-empty-bg` | `#eef1f722` | `var(--surface-2)` |
| `--stage-empty-border` | `#dde1ea55` | `var(--line)` |
| `--success` | `#168a55` | `#168a55` |
| `--success-soft` | `#e8f7ef` | `#19322c` |
| `--success-text` | `#168a55` | `#8ee0b3` |
| `--surface` | `#ffffff` | `#161e2d` |
| `--surface-2` | `#f8fafc` | `#202a3b` |
| `--surface-info-1` | `#dde9fd` | `#1d2e49` |
| `--surface-info-2` | `#dbe6fb` | `#1d2e49` |
| `--surface-info-3` | `#d0e0f5` | `#1d2e49` |
| `--surface-info-4` | `rgba(37, 99, 235, .08)` | `rgba(110, 166, 255, .12)` |
| `--surface-info-5` | `rgba(37,99,235,.08)` | `rgba(110, 166, 255, .12)` |
| `--surface-info-6` | `#a78bfa` | `#1d2e49` |
| `--surface-info-7` | `#dbe7fb` | `#1d2e49` |
| `--surface-info-8` | `#c4b5fd` | `#1d2e49` |
| `--surface-neutral-1` | `#c2cbdb` | `#202a3b` |
| `--surface-neutral-10` | `#e8f8ef` | `#202a3b` |
| `--surface-neutral-11` | `#fff6f7` | `#202a3b` |
| `--surface-neutral-12` | `#e7ebf1` | `#202a3b` |
| `--surface-neutral-13` | `#f1f4fa` | `#202a3b` |
| `--surface-neutral-14` | `#e3f1ff` | `#202a3b` |
| `--surface-neutral-15` | `#fff5f5` | `#202a3b` |
| `--surface-neutral-16` | `#fdecec` | `#202a3b` |
| `--surface-neutral-17` | `#f5f8ff` | `#202a3b` |
| `--surface-neutral-18` | `#f7faff` | `#202a3b` |
| `--surface-neutral-19` | `#e2ecf9` | `#202a3b` |
| `--surface-neutral-2` | `#fbfcfe` | `#202a3b` |
| `--surface-neutral-20` | `#f7f9fc` | `#202a3b` |
| `--surface-neutral-21` | `#efeae2` | `#202a3b` |
| `--surface-neutral-22` | `rgba(0,0,0,.06)` | `rgba(160, 180, 210, .08)` |
| `--surface-neutral-23` | `rgba(0,0,0,.04)` | `rgba(160, 180, 210, .08)` |
| `--surface-neutral-24` | `rgba(255,255,255,.55)` | `rgba(160, 180, 210, .08)` |
| `--surface-neutral-25` | `#e8f2ff` | `#202a3b` |
| `--surface-neutral-26` | `#f2f5fa` | `#202a3b` |
| `--surface-neutral-27` | `#e3e8f0` | `#202a3b` |
| `--surface-neutral-28` | `#ebeef2` | `#202a3b` |
| `--surface-neutral-29` | `#fdeced` | `#202a3b` |
| `--surface-neutral-3` | `#fffafa` | `#202a3b` |
| `--surface-neutral-30` | `#eaf7ee` | `#202a3b` |
| `--surface-neutral-31` | `#fff8e9` | `#202a3b` |
| `--surface-neutral-32` | `#f0fbf3` | `#202a3b` |
| `--surface-neutral-33` | `rgba(10,20,40,.45)` | `rgba(160, 180, 210, .08)` |
| `--surface-neutral-34` | `#efe6fe` | `#202a3b` |
| `--surface-neutral-35` | `#f5f0fe` | `#202a3b` |
| `--surface-neutral-36` | `#f8faff` | `#202a3b` |
| `--surface-neutral-37` | `rgba(255,255,255,.75)` | `rgba(160, 180, 210, .08)` |
| `--surface-neutral-38` | `#f6f2ff` | `#202a3b` |
| `--surface-neutral-39` | `#ece5fc` | `#202a3b` |
| `--surface-neutral-4` | `#eef1f6` | `#202a3b` |
| `--surface-neutral-40` | `#dcf5e4` | `#202a3b` |
| `--surface-neutral-5` | `#fff5f0` | `#202a3b` |
| `--surface-neutral-6` | `#f3f7ff` | `#202a3b` |
| `--surface-neutral-7` | `#f0f5ff` | `#202a3b` |
| `--surface-neutral-8` | `#f9fbfd` | `#202a3b` |
| `--surface-neutral-9` | `#eef1f5` | `#202a3b` |
| `--surface-warning-1` | `#fff3e0` | `#332a1c` |
| `--text` | `#172033` | `#e5ecf7` |
| `--text-danger-1` | `#a44249` | `#ffb4be` |
| `--text-danger-2` | `#a9373f` | `#ffb4be` |
| `--text-danger-3` | `#7a2a30` | `#ffb4be` |
| `--text-danger-4` | `#dc4a3a` | `#ffb4be` |
| `--text-info-1` | `rgba(37, 99, 235, .12)` | `#a8cbff` |
| `--text-info-10` | `#c4b5fd` | `#a8cbff` |
| `--text-info-11` | `#2c4f8f` | `#a8cbff` |
| `--text-info-12` | `#3ec6d6` | `#a8cbff` |
| `--text-info-13` | `#3467d6` | `#a8cbff` |
| `--text-info-14` | `#7749d1` | `#a8cbff` |
| `--text-info-2` | `#2563eb` | `#a8cbff` |
| `--text-info-3` | `#1c6fd1` | `#a8cbff` |
| `--text-info-4` | `#53bdeb` | `#a8cbff` |
| `--text-info-5` | `#2a80ea` | `#a8cbff` |
| `--text-info-6` | `#0a5fc7` | `#a8cbff` |
| `--text-info-7` | `#7c3aed` | `#a8cbff` |
| `--text-info-8` | `#6d28d9` | `#a8cbff` |
| `--text-info-9` | `#1a2f57` | `#a8cbff` |
| `--text-neutral-1` | `#627087` | `#c2cde0` |
| `--text-neutral-10` | `#8b99ad` | `#c2cde0` |
| `--text-neutral-11` | `#7b8aa0` | `#c2cde0` |
| `--text-neutral-12` | `#c4c9d4` | `#c2cde0` |
| `--text-neutral-13` | `#94a3b8` | `#c2cde0` |
| `--text-neutral-14` | `#5c6b80` | `#c2cde0` |
| `--text-neutral-15` | `#5b6478` | `#c2cde0` |
| `--text-neutral-16` | `#92a0b5` | `#c2cde0` |
| `--text-neutral-2` | `#91a0b6` | `#c2cde0` |
| `--text-neutral-3` | `#9aa7ba` | `#c2cde0` |
| `--text-neutral-4` | `#7d899c` | `#c2cde0` |
| `--text-neutral-5` | `#8b97a9` | `#c2cde0` |
| `--text-neutral-6` | `#6c7890` | `#c2cde0` |
| `--text-neutral-7` | `#4d5a70` | `#c2cde0` |
| `--text-neutral-8` | `#b7c0cd` | `#c2cde0` |
| `--text-neutral-9` | `#9aa6b7` | `#c2cde0` |
| `--text-success-1` | `#1f8a43` | `#8ee0b3` |
| `--text-success-2` | `#1e7a43` | `#8ee0b3` |
| `--text-success-3` | `#1a6b3f` | `#8ee0b3` |
| `--text-success-4` | `#2c7a4d` | `#8ee0b3` |
| `--text-success-5` | `#16a34a` | `#8ee0b3` |
| `--text-success-6` | `#1e8f52` | `#8ee0b3` |
| `--text-warning-1` | `#b5690a` | `#f6cf89` |
| `--text-warning-2` | `#845b14` | `#f6cf89` |
| `--text-warning-3` | `#8a5a06` | `#f6cf89` |
| `--text-warning-4` | `#6b4600` | `#f6cf89` |
| `--text-warning-5` | `#d97706` | `#f6cf89` |
| `--text-warning-6` | `#d9702b` | `#f6cf89` |
| `--tooltip-bg` | `#172033` | `#334157` |
| `--tooltip-text` | `#ffffff` | `#e5ecf7` |
| `--topbar-bg` | `rgba(255,255,255,.88)` | `rgba(22,30,45,.94)` |
| `--user-color-weight` | `100%` | `25%` |
| `--warning` | `#b87108` | `#b87108` |
| `--warning-soft` | `#fff5df` | `#332a1c` |
| `--warning-text` | `#b87108` | `#f6cf89` |

## Rutas y zonas propias

| Ruta | Zona a revisar |
| --- | --- |
| `/admin/announcements` | Panel: administración |
| `/admin/clients` | Panel: administración |
| `/admin/licenses` | Panel: administración |
| `/admin` | Panel: administración |
| `/admin/payment-methods` | Panel: administración |
| `/admin/payment-requests` | Panel: administración |
| `/admin/plans` | Panel: administración |
| `/admin/security` | Panel: administración |
| `/admin/settings` | Panel: administración |
| `/admin/suggestions` | Panel: administración |
| `/api-settings` | Panel: estilos globales |
| `/automations/[id]` | Panel: estilos globales; nodos, lienzo, controles, simulador y plantillas |
| `/automations` | Panel: estilos globales; nodos, lienzo, controles, simulador y plantillas |
| `/automations/templates` | Panel: estilos globales; nodos, lienzo, controles, simulador y plantillas |
| `/c/[slug]` | Pública, siempre clara |
| `/calendar` | Panel: estilos globales; chips y paleta de agentes |
| `/conversations` | Panel: estilos globales; burbujas, documentos, citas, reacciones, emojis, menciones |
| `/crm/deals` | Panel: estilos globales; tarjetas, columnas, arrastre y etiquetas de usuario |
| `/crm/leads` | Panel: estilos globales; tarjetas, columnas, arrastre y etiquetas de usuario |
| `/crm/pipelines` | Panel: estilos globales; tarjetas, columnas, arrastre y etiquetas de usuario |
| `/dashboard` | Panel: estilos globales; series SVG y leyendas |
| `/feedback` | Panel: estilos globales |
| `/incidents` | Panel: estilos globales |
| `/instances` | Panel: estilos globales; QR siempre negro/blanco, configuración del widget |
| `/login` | Pública, siempre clara |
| `/my-plan` | Panel: estilos globales |
| `/` | Pública, siempre clara |
| `/privacidad` | Pública, siempre clara |
| `/register` | Pública, siempre clara |
| `/team` | Panel: estilos globales |
| `/terminos` | Pública, siempre clara |

## Excepciones justificadas

- Los valores `#6b8afd` de selectores de color son datos persistidos para etiquetas/etapas/widget; no son estilos del panel.
- Los SVG de marca, Google y Open Graph, y los estilos propios públicos conservan colores de marca fijos.
- Los colores elegidos por usuarios (etapas y etiquetas) siguen siendo datos; su texto se adapta con CSS en oscuro conservando el color como indicador.
- QR: SVG negro sobre blanco y margen de seguridad blanco en ambos temas.
- El fondo del chat contiene un SVG con colores codificados `%23d9d0c0`. Se conserva el recurso original en claro y se atenúa mediante `background-blend-mode: soft-light` en oscuro.

## Validación

Verificado el 2026-10-14, con Chromium y datos simulados. No se conectó a sesiones reales ni se enviaron mensajes.

- `npm run build`: generación Prisma, API, worker y Next.js correctos. Después de los últimos ajustes de CSS también pasó `npm run build -w @brainwsp/web`.
- `node --import tsx apps/web/lib/theme.test.ts`: 4 pruebas correctas (preferencia, sistema, rutas públicas y almacenamiento bloqueado).
- 24 rutas del panel/admin recorridas en claro y oscuro a 1440 px y 390 px. Sin errores de JavaScript, desbordamiento horizontal en móvil ni superficies blancas detectadas fuera del QR. `/admin` redirige a la vista de usuarios; no añade otra pantalla.
- Persistencia al recargar, cambios del sistema en vivo, preferencia explícita independiente del sistema y sincronización entre pestañas: correctos.
- Script inicial probado con los bundles de la aplicación bloqueados: aplica oscuro antes de hidratar.
- Lecturas/escrituras de preferencia bloqueadas: el selector y la navegación interna siguen funcionando en memoria.
- Cerrar sesión lleva a login claro; iniciar sesión con respuesta simulada restaura la preferencia oscura del panel.
- Selector de emojis probado abierto en ambos temas y cambiando en vivo; chat móvil abierto verificado en claro y oscuro.
- Auditoría de `globals.css`: ningún color hex/rgba fuera de las declaraciones de tokens, excluyendo comentarios y el SVG codificado documentado arriba.
- QR capturado en oscuro decodificado con jsQR: contenido recuperado correctamente. No sustituye una vinculación física con un teléfono.
- 11 vistas comparadas contra el CSS original: sin diferencias en estilos calculados de color, fondo, borde, sombras, SVG, ancho, alto y outline. Las capturas pueden variar en unos pocos píxeles de suavizado de bordes; no se afirma identidad binaria píxel por píxel.
- Contraste automatizado de texto visible en oscuro en esas 11 vistas, excluyendo el sidebar de marca fijo y controles deshabilitados: sin casos inferiores a 4.5:1 en los datos de prueba. Los colores del modo claro se conservaron; no se realizó una auditoría WCAG completa del producto.

Las pruebas visuales de autenticación y recursos usan una API simulada. No se repitieron contra servicios reales la creación/conexión de instancias, los endpoints legacy/JSON ni la reconexión de WhatsApp, ya que no cambió backend, worker ni schema.

## Implementación

- Sin dependencias nuevas en el proyecto. `ThemeProvider` comparte preferencia y tema resuelto para panel, portales, emojis y React Flow.
- La clave `brainwsp_theme` acepta `light`, `dark`, `system`; un valor ausente o inválido sigue al sistema. Acceso a storage protegido con `try/catch`.
- El script del head y el proveedor comparten clave, consulta de medios y regla de rutas públicas. Los cambios internos de ruta se aplican antes de pintar mediante layout effect.
- Tokens separados para fondos de marca y texto de marca/estado; el texto oscuro no reutiliza el azul profundo de un botón.
- Colores elegidos por usuarios permanecen como datos; `color-mix` aclara su texto en oscuro y mantiene su indicador original.
- Sidebar azul de marca; QR blanco/negro; landing, login, registro, legales, widget y Open Graph conservan su apariencia clara.
- Se entrega el conjunto en el árbol de trabajo local, sin commits, PR ni publicación. El inventario se creó antes de los cambios y las fases se validaron de forma secuencial.

## Capturas

Datos ficticios de Empresa Demo. Las capturas corresponden a un navegador de desarrollo.

| Vista | Claro | Oscuro |
| --- | --- | --- |
| Dashboard | [Ver](dark-mode/dashboard-light.png) | [Ver](dark-mode/dashboard-dark.png) |
| Conversaciones | [Ver](dark-mode/conversations-light.png) | [Ver](dark-mode/conversations-dark.png) |
| WhatsApp | [Ver](dark-mode/instances-light.png) | [Ver](dark-mode/instances-dark.png) |
| Pipelines CRM | [Ver](dark-mode/crm-pipelines-light.png) | [Ver](dark-mode/crm-pipelines-dark.png) |
| Calendario | [Ver](dark-mode/calendar-light.png) | [Ver](dark-mode/calendar-dark.png) |
| Editor de flujos | [Ver](dark-mode/automations-qa-flow-light.png) | [Ver](dark-mode/automations-qa-flow-dark.png) |
| Administración | [Ver](dark-mode/admin-settings-light.png) | [Ver](dark-mode/admin-settings-dark.png) |
| Chat móvil abierto | [Ver](dark-mode/chat-mobile-light.png) | [Ver](dark-mode/chat-mobile-dark.png) |
| Emojis | [Ver](dark-mode/emoji-light.png) | [Ver](dark-mode/emoji-dark.png) |

[QR en oscuro](dark-mode/qr-dark.png). [Reporte de rutas](dark-mode/route-report.json). [Reporte de contraste y comparación](dark-mode/detail-report.json).
