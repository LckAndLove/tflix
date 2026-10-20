# TFLIX 播放源接口文档

`swagger.json` 是六个公开播放源的本地 OpenAPI 3.1 目录，采集日期为 2026-10-20。它记录了公开文档中能确认的嵌入地址、查询参数、内容信息接口和播放器消息能力。

OpenAPI 的路径使用 `/vixsrc/...`、`/moviesapi/...` 这样的本地命名空间，避免不同厂商相同路径在一个 OpenAPI 文件里互相覆盖。每个操作都带有 `x-upstreamUrl`，那才是实际请求地址；`x-sourceDocumentation` 是对应的公开文档页面。

| TFLIX 名称 | 源 | 公开文档 | 记录内容 |
| --- | --- | --- | --- |
| Rakan | `vixsrc.to` | https://vixsrc.to/ | 电影/剧集嵌入、目录列表、播放器事件 |
| Bard | `moviesapi.to` | https://moviesapi.to/ | 电影/剧集嵌入、发现接口、趋势接口、播放器 API |
| Xayah | `vidsrc.sh` | https://vidsrc.sh/vidsrc/docs/ | 嵌入、内容信息、最新内容、ID 列表、字幕和事件 |
| Ekko | `cinesrc.st` | https://cinesrc.st/docs | 嵌入、播放器参数、字幕、postMessage 事件和命令 |
| Naafiri | `vidfast.vc` | https://vidfast.vc/ | 电影/剧集嵌入、服务器选择、字幕和选集参数 |
| Ryze | `vidlink.pro` | https://vidlink.pro/ | 电影/剧集/动画嵌入、播放器定制、字幕和进度事件 |

这些接口是第三方公开页面提供的嵌入能力，不代表 TFLIX 拥有视频文件或获得内容授权。域名、参数和可用性可能变化；修改播放器时应先重新核对上面的来源页面。
