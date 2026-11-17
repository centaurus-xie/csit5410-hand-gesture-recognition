# 用视频制作手势图片数据集

## 在 PyCharm 中使用

1. 确认顶部当前分支为 `dev/qs-li`。
2. 打开 `scripts/video_to_images.py`，右键文件，选择 **运行**。不需要填写运行参数，会弹出设置窗口。
3. 选择本地视频和你想保存图片的文件夹，再填写手势标签（0–9）、每秒抽帧数和图片尺寸。无需填写拍摄人或批次。
4. 如开头在调整姿势，可设置开始秒数；结束秒数留空会提取到视频末尾。
5. 点击 **开始提取图片**。图片会直接保存到你选择的文件夹，不再增加数字、拍摄人或其他子文件夹。

如果提示缺少 `cv2`，在 PyCharm 当前 Python 解释器对应的环境中安装：

```powershell
python -m pip install "opencv-contrib-python>=4.8,<4.12"
```

项目的 `images` 可选依赖也包含 OpenCV；如果已经装过，直接运行即可。

## 拍摄前先统一规则

- 一段视频只对应一种手势。请先确定数字 0–9 分别摆什么姿势；`unknown` 用于明确的非目标姿势。窗口默认标签为 `0`。脚本不会自动判断你正在比什么数字。
- 保留原视频。让完整手掌和手指在画面内，检查是否清晰；分多次拍摄，变化角度、距离、背景和光线。
- 默认每秒提取 **10 张**，也可以自己改成 15、20、30 等。例如 20 秒视频按每秒 10 张提取，大约得到 200 张；60 秒大约 600 张。实际数量受视频帧率和所选时间范围限制。

## 输出内容

如果你选择 `D:\my_dataset\6`，结果直接放在这里，例如：

```text
D:\my_dataset\6\
  video-<本次编号>_f00000000.jpg
  video-<本次编号>_f00000003.jpg
  ...
  frames_video-<本次编号>.csv  # 图片、标签、帧号、时间点
  info_video-<本次编号>.json   # 原视频路径、提取参数和结果
```

每次运行使用新的文件名前缀，同一个文件夹可接收多个视频的图片，保留已有文件。图片默认直接缩放为 **100×100 像素**，不裁剪；长方形视频缩放成正方形会改变宽高比例。可以在尺寸栏改为其他宽高，如 `224x224`，或填写 `原尺寸` / `original` 保留视频尺寸。`100*100`、`100×100` 也能识别。图片使用 JPEG 质量 95 保存，原视频仍需保留。手机竖屏视频导出后请检查方向。

每次运行会生成一份独立的 `frames_*.csv`，记录 `sample_id,image_path,source_id,label,video_id,frame_index,timestamp_sec,timestamp_source,width,height,source_width,source_height`。`width/height` 是输出图片尺寸，`source_width/source_height` 是视频帧尺寸。图片和 CSV 位于同一文件夹；不记录拍摄人或批次。

脚本优先使用解码器提供的时间戳；不可用时按帧率估算，并在 `timestamp_source` 标记为 `fps-estimate`。手机可变帧率视频在回退时的时间点是近似值。抽帧频率超过视频帧率时，最多保存每个实际解码帧一次。

如果转换中途报错，会留下对应本次编号的 `INCOMPLETE_*.txt`，请检查后再使用，勿将其当作完整转换结果。

## 命令行使用（可选）

从项目根目录执行，例如数字 6 的视频，取第 2 秒开始、到第 22 秒之前的画面：

```powershell
python scripts/video_to_images.py "D:\videos\gesture6.mp4" --output "D:\my_dataset\6" --label 6 --sample-fps 10 --size 100x100 --start 2 --end 22
```

`--output` 为必填参数，图片直接存入指定目录。不填写 `--sample-fps` 时使用每秒 10 张；不填写 `--size` 时使用 `100x100`。

这个 CSV 只作为抽帧索引；项目现有 `gesture-extract` 要求 `1–10/unknown` 标签和真实的 `person_id`、`session_id` 字段，与当前 `0–9` 采集格式不同，接入训练前需统一标签定义并补齐必要信息。本工具不会替你生成拍摄人信息。

## 抽帧后还需要检查

脚本仅按时间取样，不会自动删除模糊帧、切换动作、画面里没手或比错数字的图片。请先做人工筛选；如果后续仍使用 CSV，删除图片时也要同步删除 CSV 中对应的行。

抽取更多帧可以增加文件数量，但相邻画面通常很相似。划分数据时，同一视频的图片和增强版本应放在同一个集合中；项目若要进行按人评估，仍需另外准备真实的人员信息。

实现使用 OpenCV 的 [VideoCapture](https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html) 和 [视频读取属性](https://docs.opencv.org/4.x/d4/d15/group__videoio__flags__base.html)。
