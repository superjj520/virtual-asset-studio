"""虚拟资产创作工作台的 ComfyUI 节点包。

安装：把整个 comfyui-vas-nodes 目录复制到 ComfyUI/custom_nodes/ 下，重启 ComfyUI。
节点会出现在「虚拟资产」分类里。
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
