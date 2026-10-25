export type CharacterFactChoice = {
  id: string;
  label: string;
  value: string;
};

const choices = (...items: Array<string | [string, string]>): CharacterFactChoice[] =>
  items.map((item, index) => {
    const [label, value] = Array.isArray(item) ? item : [item, item];
    return { id: `${index + 1}-${label}`, label, value };
  });

/**
 * 角色事实的常用选择。这里只提供可复用的视觉语言，不替用户猜测身份；
 * “自定义”仍保留在专业编辑中，且图片证据类细项不使用文字选项冒充素材。
 */
export const CHARACTER_FACT_CHOICES: Record<string, CharacterFactChoice[]> = {
  "identity.age": choices(
    "22–29 岁",
    "30–39 岁",
    "40–49 岁",
    "50 岁以上",
    ["成年青年 18–24", "成年青年（18–24岁）"],
    ["年轻成人 25–34", "年轻成人（25–34岁）"],
    ["成熟成人 35–49", "成熟成人（35–49岁）"],
    ["中年 50–64", "中年成人（50–64岁）"],
    ["老年 65+", "老年成人（65岁以上）"],
  ),
  "identity.gender": choices("女性呈现", "男性呈现", "中性呈现", "非人角色"),
  "identity.ancestry": choices("东亚", "东南亚", "南亚", "中东／北非", "非洲", "欧洲", "拉丁／混合", "幻想种族"),
  "identity.persona": choices("东方主角", "时尚主理人", "职业精英", "创意艺术家", "世界探索者", "清冷主角", "温柔主角", "强势领导者", "神秘旅人", "专业人士", "活力青年", "反差型角色"),
  "character.personality": choices("清冷克制", "温柔松弛", "强势果断", "神秘疏离", "明快活力"),
  "character.voice": choices("轻柔", "清冷", "成熟", "明快", "磁性"),
  "character.relationship": choices("独立主角", "亲密搭档", "知己朋友", "对手关系", "团队成员"),
  "character.interest": choices("艺术创作", "时尚造型", "旅行探索", "阅读研究", "运动生活", "科技创造"),
  "character.performance": choices("镜头表现", "对话表演", "生活动作", "动作场面", "情绪特写"),
  "character.archetype": choices("守护者", "探索者", "局外人", "谋划者", "治愈者"),
  "character.drive": choices("寻找归属", "证明自己", "守护重要之人", "揭开真相", "获得自由"),
  "character.conflict": choices("信任与防备", "责任与欲望", "过去与现在", "秩序与自由", "理想与现实"),
  "character.opening": choices("初次登场", "任务开始", "意外重逢", "危机逼近", "平静日常"),

  "body.height": choices("娇小", "中等", "高挑", "超高挑", "非人比例"),
  "body.proportions": choices("自然均衡", "修长时装比例", "短躯干长腿", "长躯干", "夸张风格化比例"),
  "body.build": choices("纤细", "匀称", "曲线感", "健美", "强壮", "丰满", "夸张体型"),
  "body.shoulders": choices("窄肩柔和", "肩颈均衡", "直角肩", "宽肩有力量", "含胸松弛"),
  "body.waist_hip": choices("腰胯均衡", "细腰曲线", "直筒轮廓", "宽胯稳定", "力量型下身"),
  "body.limbs": choices("自然比例", "修长四肢", "纤细腿型", "肌肉线条", "短而有力量"),

  "face.shape": choices("柔和鹅蛋脸", "圆脸", "长脸", "方脸", "心形脸", "菱形脸"),
  "face.eyes": choices("杏仁眼", "圆眼", "狭长眼", "深邃眼型", "下垂眼", "上挑眼"),
  "face.eye_color": choices("深灰棕", "近黑", "琥珀", "冷灰", "冰蓝", "灰绿"),
  "face.brows": choices("自然平眉", "柔和弯眉", "英气剑眉", "细长古典眉", "浓密野生眉"),
  "face.nose": choices("细直鼻梁", "自然圆润鼻尖", "挺拔鼻梁", "短鼻", "宽鼻翼"),
  "face.lips": choices("自然薄唇", "柔和饱满唇", "清晰唇峰", "圆润唇形", "宽唇"),
  "face.ears": choices("自然贴耳", "小巧耳形", "明显耳廓", "精灵尖耳"),
  "face.marks": choices("无明显标记", "雀斑", "泪痣", "面部小痣", "疤痕", "幻想纹样"),
  "face.jaw_cheeks": choices("柔和下颌", "圆润面颊", "清晰下颌线", "高颧骨", "窄下巴"),

  "hair.color": choices("自然黑", "深棕", "浅棕", "金色", "银白", "红色", "彩色幻想发色"),
  "hair.length": choices("短发", "及肩", "中长发", "长发", "及腰长发"),
  "hair.texture": choices("柔顺直发", "自然微卷", "明显卷发", "蓬松发质", "湿发质感", "丝绸光泽"),
  "hair.style": choices("自然披发", "高马尾", "低马尾", "盘发", "半扎发", "短发造型", "古典发髻"),
  "hair.bangs": choices("无刘海", "中分", "侧分", "空气刘海", "齐刘海", "碎发鬓角"),
  "hair.accessory": choices("无发饰", "发夹", "发带", "花簪", "珠翠头冠", "帽饰", "幻想装置"),
  "hair.hairline": choices("自然发际线", "圆润发际线", "美人尖", "轻微碎发", "高发际线"),

  "skin.tone": choices("冷白", "自然白", "暖肤", "小麦", "深肤", "幻想肤色"),
  "skin.undertone": choices("冷调", "中性", "暖调", "橄榄调", "红润调"),
  "skin.texture": choices("真实细腻纹理", "柔和哑光", "自然光泽", "轻微雀斑", "成熟肌理", "幻想材质"),
  "skin.marks": choices("无明显标记", "身体小痣", "雀斑", "胎记", "疤痕", "纹身／纹样"),

  "wardrobe.direction": choices("东方礼服", "高定时装", "职场正装", "自然日常", "幻想造型"),
  "wardrobe.outerwear": choices("无外套", "西装外套", "长风衣", "短夹克", "斗篷", "古典外袍", "功能外套"),
  "wardrobe.top": choices("衬衫", "针织上装", "修身上衣", "宽松上衣", "礼服上身", "古典交领", "护甲上身"),
  "wardrobe.innerwear": choices("无可见内搭", "背心", "吊带", "衬衣内搭", "高领内搭", "贴身功能层"),
  "wardrobe.underwear_top": choices("不展示", "基础内衣", "无肩带胸衣", "运动内衣", "古典抹胸", "幻想胸甲"),
  "wardrobe.underwear_bottom": choices("不展示", "基础内裤", "无痕内裤", "高腰内裤", "运动短裤", "安全裤"),
  "wardrobe.lower": choices("裤装轮廓", "裙装轮廓", "连体轮廓", "短下装", "长下装", "分层古典下装"),
  "wardrobe.pants": choices("无裤装", "直筒裤", "阔腿裤", "修身裤", "短裤", "工装裤", "古典长裤"),
  "wardrobe.skirt": choices("无裙装", "短裙", "及膝裙", "长裙", "开衩裙", "百褶裙", "古典襦裙"),
  "wardrobe.dress": choices("无连衣装", "修身礼服", "长礼服", "短礼服", "日常连衣裙", "古典袍服", "幻想连体装"),
  "wardrobe.underwear": choices("不展示", "基础贴身层", "塑形内搭", "运动贴身层", "古典贴身衣", "功能防护层"),
  "wardrobe.socks": choices("无袜", "短袜", "长袜", "连裤袜", "过膝袜", "功能袜套"),
  "wardrobe.shoes": choices("赤足", "平底鞋", "运动鞋", "短靴", "长靴", "细跟高跟鞋", "厚底鞋", "古典鞋履"),
  "wardrobe.accessories": choices("无配饰", "极简首饰", "耳饰", "项链", "腰带", "手套", "古典珠翠", "科技装置"),
  "wardrobe.palette": choices("黑白中性", "低饱和冷色", "低饱和暖色", "宝石色", "大地色", "月白金色", "高对比撞色"),
  "wardrobe.fabric": choices("棉麻", "针织", "羊毛", "丝绸缎面", "薄纱蕾丝", "皮革", "金属装甲", "科技面料"),
  "wardrobe.fit": choices("贴身剪裁", "合体剪裁", "宽松廓形", "高腰强调比例", "垂坠流动", "结构化硬挺"),

  "expression.neutral": choices("平静克制", "自然放松", "清冷疏离", "温柔亲和", "严肃专注", "自信从容"),
  "expression.smile": choices("不笑", "浅笑", "自然微笑", "开怀笑", "含蓄笑", "狡黠笑"),
  "expression.intense": choices("惊讶", "紧张", "害怕", "悲伤", "愤怒", "坚定", "欲言又止"),

  "pose.standing": choices("自然站姿", "正面标准站姿", "三分之四站姿", "重心单侧", "回身站姿", "自信走秀站姿"),
  "pose.seated": choices("端正坐姿", "放松坐姿", "侧坐", "倚靠坐姿", "盘腿坐姿", "动态起身"),
  "pose.gesture": choices("双手自然下垂", "双手交叠", "抱臂", "单手扶物", "指向", "抓握", "触碰面部"),
  "pose.gaze": choices("直视镜头", "看向画外", "低头垂视", "抬头仰视", "侧目", "闭眼"),
  "pose.weight_shift": choices("重心均衡", "重心落左腿", "重心落右腿", "倚靠支撑", "前倾", "后仰"),
  "pose.action": choices("静止", "行走", "奔跑", "转身", "跳跃", "挥手", "战斗动作", "舞蹈动作"),

  "scene.location": choices("极简影棚", "日常室内", "工作空间", "城市街头", "自然户外", "东方庭院", "历史建筑", "幻想空间"),
  "scene.lighting": choices("柔和自然光", "明亮影棚光", "电影侧光", "夜景霓虹", "暖色室内光", "月光轮廓光", "高反差戏剧光"),
};

export const choicesForCharacterFact = (slotKey: string) => CHARACTER_FACT_CHOICES[slotKey] ?? [];
