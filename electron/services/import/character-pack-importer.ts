import { createWriteStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import type {
  Asset,
  CharacterAssetPackImportResult,
  CharacterDetail,
  CharacterFactInput,
  CreativeCard,
  RightsStatus,
} from '../../../src/shared/types';
import { CharacterProfileRepository } from '../characters/repository';
import { AssetCollectionRepository } from '../collections/repository';
import { ProjectRepository } from '../projects/repository';
import { ImportService } from './import-service';

type PackAssetDefinition = {
  filename: string;
  type: Asset['type'];
  secondaryCategory: string;
  moduleKey: string;
  role: string;
  factEvidence: string[];
};

const PACK_ASSETS: PackAssetDefinition[] = [
  { filename: '01-front-hero-4k.png', type: 'character', secondaryCategory: '角色主参考', moduleKey: 'identity', role: '身份主参考', factEvidence: ['identity.age', 'identity.gender', 'identity.ancestry', 'identity.persona'] },
  { filename: '02-three-quarter-4k.png', type: 'reference_image', secondaryCategory: '全身设定', moduleKey: 'body', role: '三分之四全身', factEvidence: ['body.build', 'body.proportions'] },
  { filename: '03-side-angle-4k.png', type: 'reference_image', secondaryCategory: '全身设定', moduleKey: 'views', role: '侧角全身', factEvidence: ['view.side'] },
  { filename: '04-upper-skin-earrings-nails.png', type: 'reference_image', secondaryCategory: '表情与细节', moduleKey: 'face', role: '脸部与五官细节', factEvidence: ['face.eyes', 'face.lips', 'skin.texture', 'view.face_front'] },
  { filename: '05-dress-body-detail.png', type: 'wardrobe', secondaryCategory: '礼服与正装', moduleKey: 'wardrobe', role: '礼服与身体细节', factEvidence: ['wardrobe.dress', 'wardrobe.fabric', 'wardrobe.fit'] },
  { filename: '06-left-hand-burgundy-nails.png', type: 'reference_image', secondaryCategory: '表情与细节', moduleKey: 'pose', role: '左手与美甲细节', factEvidence: ['pose.gesture', 'face.marks'] },
  { filename: '07-right-hand-burgundy-nails.png', type: 'reference_image', secondaryCategory: '表情与细节', moduleKey: 'pose', role: '右手与美甲细节', factEvidence: ['pose.gesture'] },
  { filename: '08-gold-shoe-detail.png', type: 'wardrobe', secondaryCategory: '配饰与鞋履', moduleKey: 'wardrobe', role: '鞋履细节', factEvidence: ['wardrobe.shoes', 'wardrobe.accessories'] },
  { filename: '09-front-transparent-cutout-4k.png', type: 'character', secondaryCategory: '全身设定', moduleKey: 'views', role: '正面透明抠像', factEvidence: ['view.front', 'pose.standing'] },
];

const FACTS: Array<{ slotKey: string; value: string; evidence: string[] }> = [
  { slotKey: 'identity.age', value: '年轻成年（具体年龄待确认）', evidence: ['01-front-hero-4k.png'] },
  { slotKey: 'identity.gender', value: '女性呈现', evidence: ['01-front-hero-4k.png'] },
  { slotKey: 'identity.ancestry', value: '中国女性模特（按资产包设定）', evidence: ['01-front-hero-4k.png'] },
  { slotKey: 'identity.persona', value: '御姐式时装姿态，冷静、成熟、具有高级时装表现力', evidence: ['01-front-hero-4k.png'] },
  { slotKey: 'body.build', value: '修长女性轮廓，具体比例以全身参考图为准', evidence: ['02-three-quarter-4k.png', '09-front-transparent-cutout-4k.png'] },
  { slotKey: 'body.proportions', value: '保持当前全身轮廓比例，不新增未经确认的数字身材参数', evidence: ['02-three-quarter-4k.png', '03-side-angle-4k.png'] },
  { slotKey: 'face.eyes', value: '以脸部细节参考图为准，保持眼形、眼距和眼神连续', evidence: ['04-upper-skin-earrings-nails.png'] },
  { slotKey: 'face.lips', value: '以脸部细节参考图为准，保持唇形与唇色连续', evidence: ['04-upper-skin-earrings-nails.png'] },
  { slotKey: 'hair.length', value: '长发', evidence: ['01-front-hero-4k.png', '03-side-angle-4k.png'] },
  { slotKey: 'hair.style', value: '保持当前长发造型与脸部轮廓关系', evidence: ['01-front-hero-4k.png', '03-side-angle-4k.png'] },
  { slotKey: 'skin.texture', value: '保留真实皮肤纹理，不使用塑料磨皮', evidence: ['04-upper-skin-earrings-nails.png'] },
  { slotKey: 'view.front', value: '正面全身主视觉与透明抠像均可作为正面结构证据', evidence: ['01-front-hero-4k.png', '09-front-transparent-cutout-4k.png'] },
  { slotKey: 'view.face_front', value: '脸部正面和耳坠、皮肤、美甲细节', evidence: ['04-upper-skin-earrings-nails.png'] },
  { slotKey: 'view.side', value: '侧角全身视图', evidence: ['03-side-angle-4k.png'] },
  { slotKey: 'wardrobe.dress', value: '海军蓝缎面束身礼服', evidence: ['05-dress-body-detail.png'] },
  { slotKey: 'wardrobe.fabric', value: '缎面布料，保留真实褶皱、反光和穿着受力', evidence: ['05-dress-body-detail.png'] },
  { slotKey: 'wardrobe.fit', value: '束身剪裁与腰封关系保持一致', evidence: ['05-dress-body-detail.png'] },
  { slotKey: 'wardrobe.shoes', value: '金色铆钉高跟鞋', evidence: ['08-gold-shoe-detail.png'] },
  { slotKey: 'wardrobe.accessories', value: '水晶垂坠耳坠；酒红色亮面美甲作为造型识别点', evidence: ['04-upper-skin-earrings-nails.png', '08-gold-shoe-detail.png'] },
  { slotKey: 'wardrobe.palette', value: '海军蓝礼服、晶莹水晶、酒红美甲、金色鞋履', evidence: ['05-dress-body-detail.png', '08-gold-shoe-detail.png'] },
  { slotKey: 'pose.standing', value: '御姐式时装站姿，保持脚部接触和身体重心自然', evidence: ['09-front-transparent-cutout-4k.png'] },
  { slotKey: 'pose.gesture', value: '手部与美甲细节以左右手参考图为准，不替换为其他手势', evidence: ['06-left-hand-burgundy-nails.png', '07-right-hand-burgundy-nails.png'] },
];

const imageExtension = (filename: string) => ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(filename).toLowerCase());

const runUnzipToFile = (zipPath: string, entry: string, destination: string): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn('unzip', ['-p', zipPath, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
  const output = createWriteStream(destination, { flags: 'w' });
  let errorText = '';
  let childCode: number | null = null;
  let outputFinished = false;
  let settled = false;
  child.stderr.on('data', (chunk) => { errorText += String(chunk); });
  child.stdout.pipe(output);
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    output.destroy();
    reject(error);
  };
  child.on('error', fail);
  output.on('error', fail);
  const finish = () => {
    if (settled || childCode !== 0 || !outputFinished) return;
    settled = true;
    resolve();
  };
  output.on('finish', () => {
    outputFinished = true;
    finish();
  });
  child.on('close', (code) => {
    childCode = code;
    if (code !== 0) {
      fail(new Error(`读取人物资产包失败：${errorText.trim() || `unzip 退出码 ${code}`}`));
      return;
    }
    finish();
  });
});

const listZipEntries = (zipPath: string): Promise<string[]> => new Promise((resolve, reject) => {
  const child = spawn('unzip', ['-Z1', zipPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errorText = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { errorText += String(chunk); });
  child.on('error', reject);
  child.on('close', (code) => code === 0
    ? resolve(output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))
    : reject(new Error(`无法读取人物资产包目录：${errorText.trim() || `unzip 退出码 ${code}`}`)));
});

const findEntry = (entries: string[], filename: string) => entries.find((entry) => basename(entry) === filename);

const importedCard = (name: string, projectId?: string): CreativeCard => ({
  projectId,
  intent: '人物资产卡与连续出图基线',
  subject: '锁定同一位年轻成年中国女性模特，不创建新角色',
  identityAnchor: '长发；御姐式时装姿态；保持脸部、发型、肤色、身体轮廓和年龄感一致；正面、三分之四、侧角视图属于同一角色',
  bodyAndWardrobe: '修长女性轮廓；海军蓝缎面束身礼服；水晶垂坠耳坠；酒红色亮面美甲；金色铆钉高跟鞋；保留真实布料褶皱与鞋履细节',
  expressionAndPose: '以资产包中的全身站姿、脸部细节和左右手细节为基线；后续只在明确的变体中改变表情、姿势或场景',
  scene: '使用真实时装摄影或项目指定现实场景；透明抠像版可用于深色或中性背景合成',
  lighting: '保持不同角度之间的光色和阴影逻辑一致，优先保留真实皮肤与缎面材质',
  camera: '角色资产参考摄影；正面、三分之四、侧角和局部细节按同一人物比例组织',
  style: `写实人物时装摄影；资产包原始主视觉为 4:5，当前软件创作卡使用${name}的可复用角色基线`,
  mustKeep: '只使用当前角色档案与角色资产包；不得替换脸部、发型、礼服、耳坠、美甲、鞋履或身体轮廓；不得混入其他人物',
  avoid: '新建角色、脸部漂移、身材比例漂移、礼服颜色变化、配饰缺失、鞋履替换、塑料皮肤、布料失真、文字、水印、logo、乱码',
  aspectRatio: '2:3',
  referenceAssetIds: [],
});

export class CharacterAssetPackImporter {
  constructor(
    private readonly importer: ImportService,
    private readonly characters: CharacterProfileRepository,
    private readonly collections: AssetCollectionRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async import(input: { zipPath: string; projectId?: string; name?: string; rightsStatus?: RightsStatus; rightsReason?: string }): Promise<CharacterAssetPackImportResult> {
    if (typeof input?.zipPath !== 'string' || !input.zipPath.trim() || extname(input.zipPath).toLowerCase() !== '.zip') throw new Error('请选择人物资产包 .zip 文件。');
    if (!existsSync(input.zipPath) || !statSync(input.zipPath).isFile()) throw new Error('人物资产包文件不存在或不可读取。');
    if (statSync(input.zipPath).size > 500 * 1024 * 1024) throw new Error('人物资产包超过 500 MB，已拒绝读取。');
    const project = input.projectId ? this.projects.list().find((item) => item.id === input.projectId) : undefined;
    if (input.projectId && !project) throw new Error('指定项目不存在，请重新选择后导入。');
    const entries = await listZipEntries(input.zipPath);
    if (entries.length > 64) throw new Error('人物资产包条目过多，已拒绝读取。');
    const missing = PACK_ASSETS.filter((item) => !findEntry(entries, item.filename)).map((item) => item.filename);
    if (missing.length) throw new Error(`人物资产包缺少必需文件：${missing.join('、')}`);
    const tempRoot = mkdtempSync(join(tmpdir(), 'virtual-asset-studio-character-pack-'));
    const rightsStatus = input.rightsStatus ?? 'unknown';
    const imported: Asset[] = [];
    const duplicateAssetIds = new Set<string>();
    const assetByFilename = new Map<string, Asset>();
    let profileId: string | undefined;
    let collectionId: string | undefined;
    let extractedBytes = 0;
    try {
      for (const definition of PACK_ASSETS) {
        const entry = findEntry(entries, definition.filename)!;
        if (!imageExtension(entry)) throw new Error(`人物资产包中的文件不是支持的图片：${definition.filename}`);
        const destination = join(tempRoot, definition.filename);
        await runUnzipToFile(input.zipPath, entry, destination);
        const extractedSize = statSync(destination).size;
        extractedBytes += extractedSize;
        if (extractedSize > 250 * 1024 * 1024 || extractedBytes > 1_000 * 1024 * 1024)
          throw new Error('人物资产包解压内容超过安全大小限制，已停止导入。');
        const result = await this.importer.import({
          filePath: destination,
          sourcePath: input.zipPath,
          type: definition.type,
          projectId: project?.id,
          rightsStatus,
          rightsReason: input.rightsReason ?? '人物资产包已导入，等待在素材库完成审片与使用权复核。',
          secondaryCategory: definition.secondaryCategory,
        });
        assetByFilename.set(definition.filename, result.asset);
        if (result.duplicateOf) duplicateAssetIds.add(result.asset.id);
        else imported.push(result.asset);
      }
      const name = input.name?.trim() || '海军蓝缎面礼服角色（待命名）';
      const profile = this.characters.create({ name, projectId: project?.id, card: importedCard(name, project?.id), group: 'lead', lifecycle: 'draft' });
      profileId = profile.id;
      const collection = this.collections.create({
        projectId: project?.id,
        characterProfileId: profile.id,
        kind: 'character',
        name: `${name} · 角色资产包`,
        description: '由人物资产包导入：身份、形体、脸部、服装、姿势和多角度参考。导入后需逐项完成审片与权利复核。',
        status: 'draft',
      });
      collectionId = collection.id;
      for (const definition of PACK_ASSETS) {
        const asset = assetByFilename.get(definition.filename)!;
        this.collections.attachAsset(collection.id, asset.id, definition.role, definition.moduleKey, `来源文件：${definition.filename}`, true);
      }
      const evidenceAssets = new Set(assetByFilename.values());
      for (const fact of FACTS) {
        const evidence = fact.evidence.map((filename) => assetByFilename.get(filename)).filter((asset): asset is Asset => Boolean(asset && evidenceAssets.has(asset))).map((asset) => ({ assetId: asset.id }));
        const inputFact: CharacterFactInput = { slotKey: fact.slotKey, value: fact.value, state: 'draft', evidence, note: '由人物资产包清单导入；请在角色档案中逐项确认。' };
        this.characters.upsertFact(profile.id, inputFact);
      }
      return {
        profile: this.characters.getDetail(profile.id) as CharacterDetail,
        collection: this.collections.get(collection.id)!,
        assets: [...assetByFilename.values()],
        importedCount: imported.length,
        duplicateCount: duplicateAssetIds.size,
        warnings: [
          '导入后的素材默认处于待确认状态，不能直接用于生产；请在素材库完成审片与使用权复核。',
          '角色档案已建立为“设定中”，主参考图需在确认后手动绑定。',
          '源文件为 4:5 资产，本次角色创作卡暂以软件现有 2:3 画幅保存；生成时可按具体任务调整。',
        ],
        sourcePath: input.zipPath,
      };
    } catch (error) {
      if (collectionId) this.collections.remove(collectionId);
      if (profileId) this.characters.remove(profileId);
      for (const asset of imported) this.importer.removeImportedAsset(asset.id);
      throw error;
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}
