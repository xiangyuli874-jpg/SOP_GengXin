# SOP_GengXin

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="SOP_GengXin：将旧版洗衣机岗位 SOP 转换为可审核的新版工艺文件">
</p>

<p align="center">
  <code>Excel</code> · <code>Node.js</code> · <code>Python</code> · <code>SOP conversion</code>
</p>

`SOP_GengXin` 是一个面向洗衣机关键岗位的 Excel SOP 版式焕新工具。它从旧版工作簿提取工艺内容与操作图片，按新版模板组织字段和步骤，并保留需要人工复核的冲突与处理记录。

## 它解决什么问题

旧版 SOP 的工艺内容、图片和文字说明往往能够复用，但新版文件同时要求固定版式、图位、标记、品牌元素和打印设置。这个项目把两件事拆开处理：

- 用规则把旧版的岗位信息、工具物料、作业步骤、控制点和质量要求转换为结构化数据。
- 用新版模板生成工作表，并恢复图片锚点、文字框、图例框、勾选标记、媒体关系和页面设置。
- 对无法可靠推断或超出图位容量的内容写入“冲突审核”和“处理日志”，避免静默丢失。

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="SOP 焕新流程：提取旧版工作簿、应用映射规则、写入新版模板、保真与校验">
</p>

## 当前能力

- 批量解析旧版 `.xlsx` 工作簿中的单元格、图片、绘图锚点和文本框。
- 为每个岗位建立与版式分离的数据模型，再按页面容量规划新版 SOP 页。
- 生成单岗位样例和批量新版 SOP，附带冲突审核表与处理日志。
- 保留模板中的 TCL 标识、操作图例、媒体内容类型、复选标记以及打印配置。
- 通过结构测试检查关键视觉对象和生成文件的包结构。

## 快速开始

项目当前按本地 SOP 工作区的绝对路径运行。请先准备对应的旧版源文件、新版标准模板和关键岗位清单；在另一台机器上使用前，需要调整脚本中的路径配置。

生成单岗位样例：

```powershell
node src/sop_renewal/build_sample.mjs
```

批量生成新版 SOP：

```powershell
node src/sop_renewal/build_batch.mjs
```

生成批量预览并扫描公式错误：

```powershell
node src/sop_renewal/verify_batch.mjs
```

## 输入与输出

### 输入

- 旧版关键岗位 SOP 工作簿：提供原始工艺动作、参数、图片与文字说明。
- 新版洗衣机 SOP 标准模板：提供页面结构、固定视觉对象与格式约束。
- 关键岗位清单：用于判定需要勾选的关键工序。

### 输出

- 新版 SOP 工作簿：按岗位和页面容量生成的工艺文件。
- `冲突审核`：记录字段歧义、内容冲突和超出版面容量等人工复核事项。
- `处理日志`：记录岗位、步骤、图像与页面的自动处理结果。

生成结果位于 `outputs/`，默认不提交到 Git，以避免将可再生的大型文件带入仓库。

## 项目结构

```text
src/sop_renewal/
  analyze_batch.py             批量提取工作簿内容与图片
  batch_rules.mjs              岗位数据建模与业务规则
  build_batch.mjs              批量生成入口
  build_sample.mjs             单岗位样例入口
  clone_template_pages.py      根据模板创建 SOP 页面
  layout_planner.mjs           步骤与图位的动态分页
  preserve_batch.py            恢复批量输出的视觉与媒体对象
  preserve_print_settings.py   恢复单样例的打印与视觉设置
  verify_batch.mjs             输出预览与公式扫描

tests/sop_renewal/             Node.js 与 Python 结构测试
docs/superpowers/              设计规格与实施记录
assets/readme/                 README 的可编辑 SVG 视觉资产
```

## 验证

Node.js 规则测试：

```powershell
node --test tests/sop_renewal/*.test.mjs
```

Python 工作簿结构测试：

```powershell
python -m unittest discover tests/sop_renewal
```

部分测试依赖本地模板和已生成的工作簿，因此在只克隆仓库的环境中可能因缺少这些外部文件而跳过或失败。这些输入与生成物有意未纳入版本控制。

## 处理原则

- 旧版 SOP 的工艺动作、质量要求、安全要求和关键参数优先于参考案例。
- 新版案例用于版式与措辞参考，不会静默覆盖旧版中的实质内容。
- 每次转换都生成新文件，不覆盖源工作簿。
- 对高风险差异保留审核入口，让自动化承担重复工作，而不是掩盖不确定性。

## 本地忽略项

`.gitignore` 已排除 `node_modules/`、`.codex-work/`、`outputs/`、Python 缓存和 Excel 临时锁文件。当前项目输入工作簿作为可复现的转换样本保留在版本控制中。
