3DGS Web Viewer v5.1 — 公网部署包

用途
====
这是已经针对公网静态托管整理好的版本。

你需要放入两个真实文件：
1. models/splat.spz
2. viewer_config.json

其中 viewer_config.json 直接使用你当前 v5.0 已经验证成功的那一份即可。

最终目录建议
============
3DGS_Web_Viewer_v5_1_public_deploy
├─ index.html
├─ viewer_config.json
├─ .nojekyll
├─ _headers
├─ _redirects
├─ netlify.toml
└─ models
   └─ splat.spz

上线前本地验收
==============
1. 复制 splat.spz 到 models/splat.spz
2. 复制当前 viewer_config.json 到根目录
3. 双击 test_public_build.bat
4. 确认：
   - 自动进入首页视角
   - -Z Up 正确
   - 鼠标左右正确
   - WASD 速度正常
   - Pitch / Roll 限制正常
   - 全屏、轨道、漫游正常

GitHub Pages
============
最适合已有 GitHub 账号、希望链接长期固定的情况。

1. 新建一个仓库，例如：
   gaussian-digital-twin
2. 把本目录中的所有文件上传到仓库根目录。
3. GitHub 仓库：
   Settings -> Pages
4. Source：
   Deploy from a branch
5. Branch：
   main / root
6. 保存。
7. 稍等片刻后，会得到：
   https://你的用户名.github.io/gaussian-digital-twin/

注意：
GitHub 对单文件大小有限制。
如果 splat.spz 仍然超过普通 GitHub 文件上传上限，
不要强行上传，改用 Cloudflare Pages / R2 或其他对象存储。

Cloudflare Pages
================
适合模型较大、后续还要绑定自己的域名。

可将代码仓库连接到 Cloudflare Pages。
本项目无构建步骤：
- Framework preset: None
- Build command: 留空
- Build output directory: /
或上传静态目录。

Netlify
=======
也可以直接拖放整个目录到 Netlify Deploy。
本包已经包含 netlify.toml。

公网发布建议
============
- 公网只保留 splat.spz，不再部署 splat.ply。
- viewer_config.json 与 index.html 同级。
- 模型文件保持 models/splat.spz。
- 不要删除 .nojekyll / _headers / netlify.toml，它们分别服务于不同平台。
