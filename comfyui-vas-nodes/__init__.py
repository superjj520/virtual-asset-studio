"""虚拟资产创作工作台的 ComfyUI 节点包。

安装：把整个 comfyui-vas-nodes 目录复制到 ComfyUI/custom_nodes/ 下，重启 ComfyUI。
节点会出现在「虚拟资产」分类里。

除了节点，这个包还会挂三条只读路由（只在 ComfyUI 运行时生效）：
  /vas_gallery/sites      六个来源的元信息
  /vas_gallery/catalogue  条目列表（支持搜索与分页）
  /vas_gallery/thumb      缩略图代理（远程图前端拉不到，必须转一手）
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .routes import register_routes

register_routes()

# 装好之后要能一眼看出成没成——ComfyUI 启动日志里刷过几十行，没这行就得靠猜。
# 走 logging 不走 print：ComfyUI 0.43 起把 stdout 接管了，print 的内容进不了启动日志。
import logging as _logging

_logging.info("[comfyui-vas-nodes] 已加载 %d 个节点", len(NODE_CLASS_MAPPINGS))

# ComfyUI 会把这份目录下的 JS 自动加载进前端；gallery.js 就是选图弹窗。
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
