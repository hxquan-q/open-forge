<!-- Copyright The Open Forge contributors. -->
# 2026-10-21 日志调查取证附表

采样时间：2026-10-21T22:15:31+08:00。窗口：Asia/Taipei 2026-10-08 至 2026-10-21（当日截至采样）。

来源别名：dev=~/.openforge-dev/desktop-app/logs，default=~/.openforge/desktop-app/logs，archive=temp/log，build=temp 顶层日志。仅记录事件头和允许的聚合字段；未保存日志正文。

运行日志 55 文件 / 6171139 字节；文件分布 {'dev': 30, 'default': 11, 'archive': 14}；标准事件头 21325，等级 {'info': 18334, 'warn': 1154, 'error': 1837}。

计数是落盘出现次数；归档部分重叠、跨进程重复、测试输出均未当作独立事故。10-11 无标准事件，不能视为零错误。

## 逐日标准事件头

| 日期 | info | warn | error |
|---|---:|---:|---:|
| 2026-10-08 | 186 | 9 | 43 |
| 2026-10-09 | 1555 | 92 | 164 |
| 2026-10-10 | 819 | 24 | 124 |
| 2026-10-12 | 983 | 180 | 77 |
| 2026-10-13 | 166 | 14 | 3 |
| 2026-10-14 | 2866 | 214 | 187 |
| 2026-10-15 | 1664 | 68 | 50 |
| 2026-10-16 | 2179 | 102 | 328 |
| 2026-10-17 | 2243 | 125 | 268 |
| 2026-10-18 | 1859 | 108 | 143 |
| 2026-10-19 | 1585 | 59 | 213 |
| 2026-10-20 | 629 | 23 | 14 |
| 2026-10-21 | 1600 | 136 | 223 |

## Dev 性能聚合

单位 ms；p95 为 nearest-rank。各指标独立计数，未按未知启动进程身份配对；不作生产分位数或版本间因果比较。

| 指标/结果 | n | min | median | p95 | max |
|---|---:|---:|---:|---:|---:|
| boot/painted | 28 | 561 | 1881.5 | 6545 | 13757 |
| boot/timeout | 5 | 10164 | 10212 | 11357 | 11357 |
| content/painted | 3 | 7085 | 9850 | 10078 | 10078 |
| content/timeout | 30 | 10120 | 10481 | 12808 | 23303 |
| runtime | 33 | 675 | 1945 | 5563 | 21069 |
| runtime-idle | 33 | 680 | 2485 | 8498 | 22755 |

## Dev 远端资源观测

资源 reload 共 81 条；remoteOperations>0 共 26 条；为0共 55 条。累计远端操作时间可能重叠，不用总和减法推算本机 CPU。

| 最近非零样本 | reload ms | operations | remote total ms | stat | realPath |
|---|---:|---:|---:|---:|---:|
| `dev/main/2026-10-20.log:1064` | 7632 | 9 | 6883 | 8 | 1 |
| `dev/main/2026-10-20.log:1072` | 6684 | 9 | 5998 | 8 | 1 |
| `dev/main/2026-10-20.log:1303` | 1082 | 9 | 326 | 8 | 1 |
| `dev/main/2026-10-20.log:1362` | 906 | 9 | 280 | 8 | 1 |
| `dev/main/2026-10-20.log:1431` | 949 | 9 | 265 | 8 | 1 |
| `dev/main/2026-10-20.log:1583` | 941 | 9 | 256 | 8 | 1 |
| `dev/main/2026-10-21.log:267` | 4237 | 9 | 3646 | 8 | 1 |
| `dev/main/2026-10-21.log:1084` | 1012 | 9 | 248 | 8 | 1 |
| `dev/main/2026-10-21.log:1620` | 5586 | 9 | 1692 | 8 | 1 |

## 会话创建最慢样本

Dev session creation trace 共 197 条。

| 锚点 | status | totalDurationMs |
|---|---|---:|
| `dev/main/2026-10-16.log:2654` | failed | 1.84017e+06 |
| `dev/main/2026-10-16.log:2568` | completed | 1.83827e+06 |
| `dev/main/2026-10-17.log:6230` | failed | 62716.9 |
| `dev/main/2026-10-17.log:1844` | completed | 56547.8 |
| `dev/main/2026-10-17.log:1893` | completed | 45324.5 |
| `dev/main/2026-10-17.log:2491` | completed | 36468.3 |

## 关注签名（限定分类，非全部错误）

| 签名 | 出现次数 | 最近时间 | 最近锚点 |
|---|---:|---|---|
| duplicate-key-diagnostic | 16 | 2026-10-21T00:08:23.386+08:00 | `dev/render/2026-10-21.log:27` |
| fixture-ghost | 116 | 2026-10-21T11:51:15.042+08:00 | `default/main/2026-10-21.log:1393` |
| hook-missing | 122 | 2026-10-16T11:37:50.229+08:00 | `archive/2026-10-16.log:2130` |
| native-input-init-failure | 27 | 2026-10-21T11:48:36.669+08:00 | `default/main/2026-10-21.log:1388` |
| plugin-unregistered-navigation | 29 | 2026-10-21T12:00:18.079+08:00 | `dev/render/2026-10-21.log:131` |
| preview-capture-timeout | 3 | 2026-10-19T17:28:22.707+08:00 | `dev/render/2026-10-19.log:1749` |
| preview-referenceerror | 26 | 2026-10-21T15:10:15.085+08:00 | `dev/render/2026-10-21.log:467` |
| remote-directory-capability | 112 | 2026-10-21T21:59:22.996+08:00 | `dev/main/2026-10-21.log:4268` |
| sandbox-probe | 48 | 2026-10-21T19:42:51.043+08:00 | `dev/main/2026-10-21.log:3863` |

## 文件清单与采样指纹

另按默认目录marketplace多行错误栈核对：255条失败中，manifest 404为145条、offline为73条、package=wrong为36条，均含`.test.ts`栈；余1条ERR_CONNECTION_CLOSED不含测试栈。该核对只保存分类计数，不保存调用栈或用户路径。

指纹对应采样时读取的全部字节。日志仍可能追加/轮转；复算时先比对指纹。标准事件头仅取窗口内记录；build 不纳入运行事件计数。

| 来源/文件 | bytes | SHA-256 | 窗口事件头数 |
|---|---:|---|---:|
| `dev/im/2026-10-12.log` | 2098 | `81f6f405924cbe33bfc06d8be5bfbf36a860c0ab8055b1c516f5b9a1293f1fed` | 8 |
| `dev/im/2026-10-13.log` | 1049 | `2612af674f72aa8693245bbc9be263188ec0a1527e9de0c532024667141cf00d` | 4 |
| `dev/im/2026-10-14.log` | 1049 | `64359e6160f50c6869f148daceeb92537e941064925d0e817fca4ce997b4463a` | 4 |
| `dev/im/2026-10-15.log` | 2191 | `f5d4d45f91d012b82b68d37beba1b464f9fc0ea7b36534a86c9712fdffa4b86f` | 9 |
| `dev/im/2026-10-16.log` | 3240 | `1053bb0762c88314ea43e07c0617620b456c4a4a95c9ecdb48438cce63c5331a` | 13 |
| `dev/im/2026-10-17.log` | 11672 | `14167e854001aba3c20f355411644d732fc8d2deaa7aa0743f8a64c5c5da9589` | 45 |
| `dev/im/2026-10-18.log` | 4196 | `0d9e211729ff3eff9b41aa7e2789cc5cbb865a8f3e7e1d25d51a6d7719aacb3b` | 16 |
| `dev/im/2026-10-19.log` | 4196 | `d37a1001bf903e071949ab1624845d089af2d59702da2bb84f628f3a7dea8ee7` | 16 |
| `dev/im/2026-10-20.log` | 2098 | `aa06db818605a63931c05dcd07fecf089c26c1a43346e7cdc9792b747c353696` | 8 |
| `dev/im/2026-10-21.log` | 3147 | `d583794d3f4df5b8e5617c12f7e441cd73f192c7c4002fd8674e20c4e6866a36` | 12 |
| `dev/main/2026-10-12.log` | 261394 | `f347611ee8735011bea753475d6aff597bea85c1d99179c225702f8651e55529` | 1006 |
| `dev/main/2026-10-13.log` | 40131 | `a07a71560803c420b44afd9292882039d054d26e96053800f99e47c18fc44864` | 153 |
| `dev/main/2026-10-14.log` | 262570 | `4c762a861157e0d5250be4c953909209eb192b9658305d273bc14e28e6b2eb2c` | 1204 |
| `dev/main/2026-10-15.log` | 356755 | `accd829b4fef56ab00ede0fff3c68e397a87c0ffb3e253dd97400571eb7b851e` | 1563 |
| `dev/main/2026-10-16.log` | 329656 | `be0f3f4d3166c718e6c6d25d999d7ea901da5f89f986ee9e49cf898ce185c024` | 1202 |
| `dev/main/2026-10-17.log` | 697628 | `af5ca3229cf8a0736691bb2c0a0ea06ee222bd3d2457a46f7965ecdd36ab5ae5` | 2275 |
| `dev/main/2026-10-18.log` | 316829 | `3b3f8d717cfe3d2c17433ac0ba9cd90489e7ab7f98f5e80564498c64384a5f18` | 1420 |
| `dev/main/2026-10-19.log` | 367139 | `28b1a9ef0105ba6e3e4f32d3fe5facf4eb7ed40c6d8a2d3db8598c24fdc24005` | 1474 |
| `dev/main/2026-10-20.log` | 128798 | `f9d2adc26a3a3b77dfd7ffb3e180f50ede8425132ae37f6bf0577930f16a3841` | 546 |
| `dev/main/2026-10-21.log` | 354462 | `b27b3c864a16f5ce44433da5f131f2365340e994c0c9d91308714045aedce650` | 1381 |
| `dev/render/2026-10-12.log` | 56120 | `2cb4b6070041627c694acd6bf4a9eabc83803aec153d56aea342b0fad60b5328` | 225 |
| `dev/render/2026-10-13.log` | 1297 | `a123fe1068fcf48f34e9414bb1bc72ffb9eaf1823ec474b3294702ff542e681f` | 5 |
| `dev/render/2026-10-14.log` | 69717 | `cab27e54cf05c1c9e83df0e03400e9342c7e5a7bc9772d91b8993fc89e1d334d` | 269 |
| `dev/render/2026-10-15.log` | 48858 | `57bcb6109de2833019d6d781cb1ae4e94dff4ab1d68c9df03ef8be218755026b` | 182 |
| `dev/render/2026-10-16.log` | 172832 | `8f743fd42135992cf2fe8f82e53f05bdbdce323b151db47ff5179a10b5274ab4` | 460 |
| `dev/render/2026-10-17.log` | 41396 | `7a43ca7841e965bb79a05572f15ce2c21977b347186cc9446578fb9a880c5181` | 153 |
| `dev/render/2026-10-18.log` | 64571 | `92e3a12964d352e4d084a74bd6a9a5fee80a201bba7142b32f03d901b05add47` | 159 |
| `dev/render/2026-10-19.log` | 162934 | `e9c67112d71a51e2a687a5c9c3e07951ec8d83979ea6e7fa95065f14401c9b18` | 235 |
| `dev/render/2026-10-20.log` | 19832 | `c617f6c219d588089c2da2aea4bf15699f27d85e54ea3edbbacd7b198117aa65` | 68 |
| `dev/render/2026-10-21.log` | 89086 | `d5949e7a76559dcd93a07d3653b35e53d2be04910d0c27251ebe4090e3743af8` | 246 |
| `default/main/2026-10-10.log` | 20484 | `4fb39e6871e2b82f1cdc790d1373710c05903b57a43b3a97a8ab9ab3664237a8` | 14 |
| `default/main/2026-10-12.log` | 140 | `9a2c1b27e4ccbcab14119e14177810f03c638a1e36648fa0221aeed7158b9893` | 1 |
| `default/main/2026-10-14.log` | 46005 | `09641c074f0d3620686712d7ef6e0a4d5da2e0a049f940937cf7a832393a0959` | 57 |
| `default/main/2026-10-15.log` | 22258 | `9cde5804fe66ce785a9c7a78b2f6d1922ae72e9b2c8b3aeb1825d8f941a55bbc` | 28 |
| `default/main/2026-10-16.log` | 44305 | `3c251bc2b9aa101cbf604db9a097da49c44bf09f72662d605a210a3c697ba425` | 35 |
| `default/main/2026-10-17.log` | 81945 | `3a1982e0328ea57812a2ef37b303f10aafa6cd9e500656ef9772e4cfaf85e306` | 163 |
| `default/main/2026-10-18.log` | 246550 | `e9f6f0b6ff6a42c5ba0a89e1b7d6d6ef9b027893c227b9a41e581688d5990fe3` | 515 |
| `default/main/2026-10-19.log` | 63674 | `35a0e9914baa5cf769f8dd92c2f672aca378dd5a4aa797ca4a22f5e650b4f229` | 132 |
| `default/main/2026-10-20.log` | 21941 | `a2e76b056e0728e36ca6348c9e6d04097983b53671f570b84dd24b9898e1bc1d` | 44 |
| `default/main/2026-10-21.log` | 128010 | `1f70c7bc2857f2c2c6aae30f6faaf32c8867621f091220bd842b2d826c2ccea1` | 314 |
| `default/render/2026-10-21.log` | 1883 | `be56060fe3579dc2718229d42a2c2835e9a294f79ae9393c01a7b14158f8e2b3` | 6 |
| `archive/2026-10-13.log` | 5832 | `463ff8c48fb227a3c9a03c33ba14b03d6b122d088dde35df95014e4623ae5761` | 21 |
| `archive/2026-10-14(1).log` | 104949 | `756b431516aab4e6983d6fc4628eea12728590ca58e1d32c04cad94b41366af2` | 382 |
| `archive/2026-10-14(2).log` | 294740 | `2d47a8f3f3e0f2d7e7c619566d441ccd53bbb1ccfa1734e82f9377fe082d9ed9` | 1231 |
| `archive/2026-10-14.log` | 34604 | `3882ea3eb77463a597cfaaf4eba5725bcb23a10956a401de8696587b783e776d` | 117 |
| `archive/2026-10-14.ocr-cli.59396.log` | 5936 | `31baa78af3122b40c5a016e35b9d940f029854f19697f4d1307fbb7a7ec9dd00` | 3 |
| `archive/2026-10-16.log` | 211877 | `2f735f4b712e117551a7851366894352a6e6b62fcb984f7ec273df784682c2d5` | 899 |
| `archive/main/2026-10-08.action-cli.52828.log` | 4496 | `dd5221ec6a4559ec4cad61e1bd41550fbcaa7aabc6f862937f086b45f884cf35` | 2 |
| `archive/main/2026-10-08.log` | 59981 | `35615c340e94613d2f89e48be1c79af0c9191351feaf3d735a406e48b72135d1` | 218 |
| `archive/main/2026-10-09.log` | 532781 | `d0009d93cfe99cc8ded6999f5f696c66721d9d19236805c2d5e86efa064ccbbe` | 1640 |
| `archive/main/2026-10-09.pdf-cli.12644.log` | 4646 | `80aae3eabedec02ad1c5942e0988e6cb49d87b1522ca6187edee0f9710d6c982` | 2 |
| `archive/main/2026-10-10.log` | 298972 | `4359329f22d501fdf2a27da08c86520799deb8491ffe128e18a8b6908db3588d` | 905 |
| `archive/render/2026-10-08.log` | 4939 | `28cd1e20d026e33aed49a1bd942e55aea370623e48b76c9dfbc51dc4802a6dcc` | 18 |
| `archive/render/2026-10-09.log` | 42247 | `3dce86127fa7f93adcde687de96b6171e78c5be77d727223ad8d2f5d3f2a4bee` | 169 |
| `archive/render/2026-10-10.log` | 11003 | `b0840a1aa023cf3c0994b9b474e7673ea2a5d65b80b588ddd08251087f8c16e3` | 48 |
| `build/bun-install.log` | 167 | `a9fc59a69b22fae2207a4076dcb8af6e6b016389bbf4f98034ac0cfa9526aea0` | 不纳入 |
| `build/check-backmerge.log` | 3877 | `a270a6be910eb4b8eb52ae881bf4da0e37ca729e2f2b6011d97b01f156550136` | 不纳入 |
| `build/check-quick.log` | 2330 | `4826d994f476d92c5ef4eb5aa7f604ee9b5aab0cb6ee895217692acb151930c6` | 不纳入 |
| `build/mes-kit-python-test.log` | 5591 | `63bf6ca323e725fbdc4962764db8c9e6ff7c813e4fe5def6aad9471d73481e20` | 不纳入 |
| `build/mes-kit-test.log` | 311 | `23627ed3fcc0d9c227bfc3f36163d8f04fb9a9d962a13cf24880b3c76332aee0` | 不纳入 |
| `build/pack-win-inno-2.log` | 125461 | `ec92f4da022c478db42e3d202efcdd1e3b99fa9bbcdcc90ba3826c94f39b0698` | 不纳入 |
| `build/pack-win-inno-3.log` | 1960 | `32d16d28149c507901ab8916a3eeab7e5e38fec6b1467028a2256354fa92c910` | 不纳入 |
| `build/pack-win-inno.log` | 123186 | `afd24cf3ab27ab51ede3aec9bc4d1cfcf8a14403c6d5d59679e3c20b21142ea7` | 不纳入 |
