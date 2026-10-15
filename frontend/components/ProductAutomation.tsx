import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSearch,
  Link2,
  Loader2,
  PackageCheck,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';

import {
  AccountDetail,
  AutomationTaskRun,
  ProductDeletePreview,
  ProductDeleteRule,
  ProductFilterRule,
  ProductMaterial,
  XianyuSearchResult,
} from '../types';
import { buildCsv, downloadCsv, safeFilenamePart, type CsvColumn } from '../lib/csv';
import {
  compensateProductCards,
  deleteProductDeleteRule,
  deleteProductFilterRule,
  deleteProductMaterial,
  getAccountDetails,
  getProductAutomationRuns,
  getProductDeleteRules,
  getProductFilterRules,
  getProductMaterials,
  previewProductDeleteRule,
  repairProductShortLinks,
  repairPublishedProductIds,
  runProductFilterRule,
  saveProductDeleteRule,
  saveProductFilterRule,
  searchXianyuItems,
  searchXianyuItemsMultiple,
  updateProductMaterial,
} from '../services/api';
import { confirmAction, notify } from '../services/feedback';
import {
  EmptyState,
  NoticeBanner,
  PageHeader,
  PageLoading,
  PageTabs,
  SectionHeader,
} from './ui';

type TabKey = 'materials' | 'filters' | 'delete' | 'repairs' | 'search';

const tabs: Array<{ id: TabKey; label: string; icon: React.ElementType }> = [
  { id: 'materials', label: '素材库', icon: Archive },
  { id: 'filters', label: '筛选规则', icon: Search },
  { id: 'delete', label: '删除计划', icon: Trash2 },
  { id: 'repairs', label: '补偿任务', icon: ShieldCheck },
  { id: 'search', label: '搜索咸鱼', icon: FileSearch },
];

const emptyFilterForm = {
  id: undefined as number | undefined,
  cookie_id: '',
  name: '',
  include_keywords: '',
  exclude_keywords: '',
  min_price: '',
  max_price: '',
  category: '',
  daily_limit: '50',
  enabled: true,
};

const emptyDeleteForm = {
  id: undefined as number | undefined,
  cookie_id: '',
  name: '',
  min_publish_days: '30',
  daily_limit: '10',
  skip_reply_activity: true,
  skip_order_activity: true,
  enabled: false,
};

const splitKeywords = (value: string) => (
  value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};

const normalizeImage = (value?: string) => {
  if (!value) return '';
  return value.startsWith('//') ? `https:${value}` : value;
};

const taskNames: Record<string, string> = {
  material_filter: '素材筛选',
  delete_preview: '删除预演',
  published_id_repair: '商品 ID 回写',
  short_link_repair: '链接修复',
  card_compensation: '卡券补偿',
};

const ProductAutomation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('materials');
  const [accounts, setAccounts] = useState<AccountDetail[]>([]);
  const [materials, setMaterials] = useState<ProductMaterial[]>([]);
  const [filterRules, setFilterRules] = useState<ProductFilterRule[]>([]);
  const [deleteRules, setDeleteRules] = useState<ProductDeleteRule[]>([]);
  const [runs, setRuns] = useState<AutomationTaskRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  const [editingMaterial, setEditingMaterial] = useState<ProductMaterial | null>(null);
  const [filterForm, setFilterForm] = useState(emptyFilterForm);
  const [deleteForm, setDeleteForm] = useState(emptyDeleteForm);
  const [preview, setPreview] = useState<ProductDeletePreview | null>(null);

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [
      account.id,
      account.nickname || account.remark || `账号 ${account.id.slice(0, 6)}`,
    ])),
    [accounts],
  );

  const visibleMaterials = useMemo(() => {
    const query = materialQuery.trim().toLowerCase();
    return materials.filter((material) => {
      if (accountFilter && material.cookie_id !== accountFilter) return false;
      if (!query) return true;
      return [
        material.title,
        material.source_item_id,
        material.published_item_id,
        material.category,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [materials, accountFilter, materialQuery]);

  const loadAll = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [accountData, materialData, filterData, deleteData, runData] = await Promise.all([
        getAccountDetails(),
        getProductMaterials(),
        getProductFilterRules(),
        getProductDeleteRules(),
        getProductAutomationRuns(),
      ]);
      setAccounts(accountData);
      setMaterials(materialData);
      setFilterRules(filterData);
      setDeleteRules(deleteData);
      setRuns(runData);
      if (!filterForm.cookie_id && accountData[0]) {
        setFilterForm((current) => ({ ...current, cookie_id: accountData[0].id }));
      }
      if (!deleteForm.cookie_id && accountData[0]) {
        setDeleteForm((current) => ({ ...current, cookie_id: accountData[0].id }));
      }
    } catch (error) {
      notify(`商品自动化数据加载失败：${(error as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const saveMaterial = async () => {
    if (!editingMaterial) return;
    setBusyKey(`material-${editingMaterial.id}`);
    try {
      const saved = await updateProductMaterial(editingMaterial.id, {
        title: editingMaterial.title,
        description: editingMaterial.description,
        category: editingMaterial.category,
        price: editingMaterial.price,
        images: editingMaterial.images,
        source_url: editingMaterial.source_url,
        short_url: editingMaterial.short_url,
        delivery_content: editingMaterial.delivery_content,
        publish_status: editingMaterial.publish_status,
        published_item_id: editingMaterial.published_item_id,
        publish_trace_code: editingMaterial.publish_trace_code,
      });
      setMaterials((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditingMaterial(null);
      notify('素材已保存', 'success');
    } catch (error) {
      notify(`素材保存失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const removeMaterial = async (material: ProductMaterial) => {
    const confirmed = await confirmAction(`删除本地素材“${material.title}”？`, {
      title: '删除素材',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    setBusyKey(`material-${material.id}`);
    try {
      await deleteProductMaterial(material.id);
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      notify('素材已删除', 'success');
    } catch (error) {
      notify(`删除失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const editFilterRule = (rule: ProductFilterRule) => {
    setFilterForm({
      id: rule.id,
      cookie_id: rule.cookie_id,
      name: rule.name,
      include_keywords: rule.include_keywords.join('，'),
      exclude_keywords: rule.exclude_keywords.join('，'),
      min_price: rule.min_price == null ? '' : String(rule.min_price),
      max_price: rule.max_price == null ? '' : String(rule.max_price),
      category: rule.category || '',
      daily_limit: String(rule.daily_limit),
      enabled: rule.enabled,
    });
  };

  const saveFilterRule = async () => {
    if (!filterForm.cookie_id || !filterForm.name.trim()) {
      notify('请选择账号并填写规则名称', 'warning');
      return;
    }
    setBusyKey('filter-save');
    try {
      const saved = await saveProductFilterRule({
        id: filterForm.id,
        cookie_id: filterForm.cookie_id,
        name: filterForm.name.trim(),
        include_keywords: splitKeywords(filterForm.include_keywords),
        exclude_keywords: splitKeywords(filterForm.exclude_keywords),
        min_price: filterForm.min_price === '' ? undefined : Number(filterForm.min_price),
        max_price: filterForm.max_price === '' ? undefined : Number(filterForm.max_price),
        category: filterForm.category.trim(),
        daily_limit: Number(filterForm.daily_limit) || 50,
        enabled: filterForm.enabled,
      });
      setFilterRules((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current];
      });
      setFilterForm({ ...emptyFilterForm, cookie_id: filterForm.cookie_id });
      notify('筛选规则已保存', 'success');
    } catch (error) {
      notify(`规则保存失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const runFilter = async (rule: ProductFilterRule) => {
    setBusyKey(`filter-run-${rule.id}`);
    try {
      const result = await runProductFilterRule(rule.id);
      notify(result.summary, 'success');
      await loadAll(false);
    } catch (error) {
      notify(`筛选执行失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const removeFilterRule = async (rule: ProductFilterRule) => {
    if (!await confirmAction(`删除筛选规则“${rule.name}”？`, { title: '删除规则', confirmLabel: '删除' })) return;
    try {
      await deleteProductFilterRule(rule.id);
      setFilterRules((current) => current.filter((item) => item.id !== rule.id));
      notify('筛选规则已删除', 'success');
    } catch (error) {
      notify(`删除失败：${(error as Error).message}`, 'error');
    }
  };

  const editDeleteRule = (rule: ProductDeleteRule) => {
    setDeleteForm({
      id: rule.id,
      cookie_id: rule.cookie_id,
      name: rule.name,
      min_publish_days: String(rule.min_publish_days),
      daily_limit: String(rule.daily_limit),
      skip_reply_activity: rule.skip_reply_activity,
      skip_order_activity: rule.skip_order_activity,
      enabled: rule.enabled,
    });
  };

  const saveDeletePlan = async () => {
    if (!deleteForm.cookie_id || !deleteForm.name.trim()) {
      notify('请选择账号并填写计划名称', 'warning');
      return;
    }
    setBusyKey('delete-save');
    try {
      const saved = await saveProductDeleteRule({
        id: deleteForm.id,
        cookie_id: deleteForm.cookie_id,
        name: deleteForm.name.trim(),
        min_publish_days: Number(deleteForm.min_publish_days) || 30,
        daily_limit: Number(deleteForm.daily_limit) || 10,
        skip_reply_activity: deleteForm.skip_reply_activity,
        skip_order_activity: deleteForm.skip_order_activity,
        enabled: deleteForm.enabled,
        execution_mode: 'dry_run',
      });
      setDeleteRules((current) => {
        const withoutSameAccount = current.filter((item) => item.cookie_id !== saved.cookie_id);
        return [saved, ...withoutSameAccount];
      });
      setDeleteForm({ ...emptyDeleteForm, cookie_id: deleteForm.cookie_id });
      notify('删除预演计划已保存', 'success');
    } catch (error) {
      notify(`计划保存失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const runDeletePreview = async (rule: ProductDeleteRule) => {
    setBusyKey(`delete-preview-${rule.id}`);
    try {
      const result = await previewProductDeleteRule(rule.id);
      setPreview(result);
      setRuns(await getProductAutomationRuns());
      notify(result.summary, 'info');
    } catch (error) {
      notify(`删除预演失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  const removeDeleteRule = async (rule: ProductDeleteRule) => {
    if (!await confirmAction(`删除计划“${rule.name}”？`, { title: '删除计划', confirmLabel: '删除' })) return;
    try {
      await deleteProductDeleteRule(rule.id);
      setDeleteRules((current) => current.filter((item) => item.id !== rule.id));
      notify('删除计划已删除', 'success');
    } catch (error) {
      notify(`删除失败：${(error as Error).message}`, 'error');
    }
  };

  const runRepair = async (
    key: string,
    action: () => Promise<{ summary: string }>,
  ) => {
    setBusyKey(key);
    try {
      const result = await action();
      notify(result.summary, 'success');
      await loadAll(false);
    } catch (error) {
      notify(`任务执行失败：${(error as Error).message}`, 'error');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) {
    return <PageLoading label="正在加载商品自动化配置" />;
  }

  return (
    <div className="page-stack animate-fade-in">
      <PageHeader
        title="商品自动化"
        description="管理商品素材、筛选入库、下架预演和历史数据补偿任务。"
        icon={Workflow}
        actions={(
          <button
            type="button"
            onClick={() => void loadAll(false)}
            className="ios-btn-secondary flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            刷新数据
          </button>
        )}
      />

      <PageTabs
        value={activeTab}
        onChange={setActiveTab}
        items={tabs}
        ariaLabel="商品自动化功能"
      />

      {activeTab === 'materials' && (
        <section className="space-y-4">
          <div className="toolbar">
            <div className="toolbar__group flex-1">
              <select
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value)}
                className="ios-input rounded-md px-3 py-2.5 text-sm sm:w-64"
              >
                <option value="">全部账号</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{accountNames.get(account.id)}</option>
                ))}
              </select>
              <label className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={materialQuery}
                  onChange={(event) => setMaterialQuery(event.target.value)}
                  placeholder="搜索标题、商品 ID 或分类"
                  className="ios-input w-full rounded-md py-2.5 pl-10 pr-3 text-sm"
                />
              </label>
            </div>
            <span className="text-sm font-medium text-gray-500">{visibleMaterials.length} 条素材</span>
          </div>

          <div className="section-panel">
            <SectionHeader
              title="本地素材库"
              description="筛选任务写入的商品素材，可继续补充详情、发货内容与发布信息。"
              icon={Archive}
            />
            <div className="overflow-x-auto">
              <table className="data-table responsive-data-table min-w-[980px] text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3">素材</th>
                    <th className="px-4 py-3">账号</th>
                    <th className="px-4 py-3">来源 / 发布 ID</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">发货绑定</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMaterials.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3" data-label="素材">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 flex-none overflow-hidden rounded bg-gray-100">
                            {material.images[0] ? (
                              <img
                                src={normalizeImage(material.images[0])}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : <Archive className="m-3 h-6 w-6 text-gray-400" />}
                          </div>
                          <div className="min-w-0">
                            <div className="max-w-72 truncate font-bold text-gray-900">{material.title}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {material.price == null ? '价格未设置' : `¥${material.price}`}
                              {material.category ? ` · ${material.category}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600" data-label="账号">{accountNames.get(material.cookie_id) || material.cookie_id}</td>
                      <td className="px-4 py-3" data-label="来源 / 发布 ID">
                        <div className="font-mono text-xs text-gray-700">{material.source_item_id}</div>
                        <div className="mt-1 font-mono text-xs text-gray-400">
                          {material.published_item_id || '尚未回写'}
                        </div>
                      </td>
                      <td className="px-4 py-3" data-label="状态">
                        <span className={`rounded px-2 py-1 text-xs font-bold ${
                          material.publish_status === 'published'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {material.publish_status === 'published' ? '已发布' : '草稿'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600" data-label="发货绑定">
                        {material.auto_card_id ? `卡券 #${material.auto_card_id}` : '未绑定'}
                      </td>
                      <td className="px-4 py-3" data-label="操作">
                        <div className="flex justify-end gap-1">
                          {material.source_url && (
                            <a
                              href={material.source_url}
                              target="_blank"
                              rel="noreferrer"
                              title="打开来源商品"
                              className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            type="button"
                            title="编辑素材"
                            onClick={() => setEditingMaterial({ ...material, images: [...material.images] })}
                            className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="删除素材"
                            disabled={busyKey === `material-${material.id}`}
                            onClick={() => void removeMaterial(material)}
                            className="rounded p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleMaterials.length === 0 && <EmptyState compact title="暂无素材" description="运行筛选规则后，符合条件的商品会进入本地素材库。" icon={Archive} />}
          </div>
        </section>
      )}

      {activeTab === 'filters' && (
        <section className="space-y-5">
          <div className="section-panel">
            <SectionHeader
              title={filterForm.id ? '编辑筛选规则' : '新建筛选规则'}
              description="按账号、关键词、价格和分类筛选商品，并限制每日写入数量。"
              icon={Search}
            />
            <div className="p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold text-gray-600">
                账号
                <select
                  value={filterForm.cookie_id}
                  onChange={(event) => setFilterForm({ ...filterForm, cookie_id: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                >
                  <option value="">选择账号</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{accountNames.get(account.id)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-gray-600">
                规则名称
                <input
                  value={filterForm.name}
                  onChange={(event) => setFilterForm({ ...filterForm, name: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                包含关键词
                <input
                  value={filterForm.include_keywords}
                  onChange={(event) => setFilterForm({ ...filterForm, include_keywords: event.target.value })}
                  placeholder="逗号分隔"
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                排除关键词
                <input
                  value={filterForm.exclude_keywords}
                  onChange={(event) => setFilterForm({ ...filterForm, exclude_keywords: event.target.value })}
                  placeholder="逗号分隔"
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                最低价格
                <input
                  type="number"
                  min="0"
                  value={filterForm.min_price}
                  onChange={(event) => setFilterForm({ ...filterForm, min_price: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                最高价格
                <input
                  type="number"
                  min="0"
                  value={filterForm.max_price}
                  onChange={(event) => setFilterForm({ ...filterForm, max_price: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                分类
                <input
                  value={filterForm.category}
                  onChange={(event) => setFilterForm({ ...filterForm, category: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                每日上限
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={filterForm.daily_limit}
                  onChange={(event) => setFilterForm({ ...filterForm, daily_limit: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
            </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={filterForm.enabled}
                  onClick={() => setFilterForm({ ...filterForm, enabled: !filterForm.enabled })}
                  className="flex items-center gap-2 text-sm font-bold text-gray-700"
                >
                  <span className={`relative h-6 w-11 rounded-full ${filterForm.enabled ? 'bg-yellow-400' : 'bg-gray-300'}`}>
                    <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${filterForm.enabled ? 'translate-x-5' : ''}`} />
                  </span>
                  启用规则
                </button>
                <div className="flex gap-2">
                  {filterForm.id && (
                    <button
                      type="button"
                      onClick={() => setFilterForm({ ...emptyFilterForm, cookie_id: filterForm.cookie_id })}
                      className="ios-btn-secondary rounded-md px-4 py-2.5 text-sm"
                    >
                      取消编辑
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveFilterRule()}
                    disabled={busyKey === 'filter-save'}
                    className="ios-btn-primary flex items-center gap-2 rounded-md px-4 py-2.5 text-sm disabled:opacity-50"
                  >
                    {busyKey === 'filter-save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    保存规则
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="section-panel">
            <SectionHeader
              title="已保存规则"
              description="启用的规则可以立即执行，运行结果会写入素材库。"
              actions={<span className="text-xs font-medium text-gray-500">{filterRules.length} 条</span>}
            />
            <div className="divide-y divide-gray-100">
              {filterRules.map((rule) => (
                <div key={rule.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.5fr)_180px_auto] lg:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${rule.enabled ? 'bg-[#ffe100]' : 'bg-[#e8dcbc]'}`} />
                    <span className="font-bold text-gray-900">{rule.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{accountNames.get(rule.cookie_id) || rule.cookie_id}</div>
                </div>
                <div className="text-xs leading-5 text-gray-600">
                  <div>包含：{rule.include_keywords.join('、') || '不限'}</div>
                  <div>排除：{rule.exclude_keywords.join('、') || '无'}</div>
                </div>
                <div className="text-xs text-gray-500">
                  <div>今日 {rule.today_count}/{rule.daily_limit}</div>
                  <div className="mt-1">累计 {rule.total_count} · {formatDate(rule.last_run_at)}</div>
                </div>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    title="执行筛选"
                    disabled={!rule.enabled || busyKey === `filter-run-${rule.id}`}
                    onClick={() => void runFilter(rule)}
                    className="rounded p-2 text-green-700 hover:bg-green-50 disabled:opacity-40"
                  >
                    {busyKey === `filter-run-${rule.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button type="button" title="编辑规则" onClick={() => editFilterRule(rule)} className="rounded p-2 text-gray-500 hover:bg-gray-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" title="删除规则" onClick={() => void removeFilterRule(rule)} className="rounded p-2 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                </div>
              ))}
              {filterRules.length === 0 && <EmptyState compact title="暂无筛选规则" description="先创建规则，再执行商品筛选与素材入库。" icon={Search} />}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'delete' && (
        <section className="space-y-5">
          <NoticeBanner
            type="warning"
            message="当前执行模式固定为 dry-run，只生成候选记录，不会删除闲鱼商品或本地商品。"
          />

          <div className="section-panel">
            <SectionHeader
              title={deleteForm.id ? '编辑删除预演计划' : '新建删除预演计划'}
              description="按上架时长筛选候选商品，并自动排除近期有回复或订单活动的商品。"
              icon={Trash2}
            />
            <div className="p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold text-gray-600">
                账号
                <select
                  value={deleteForm.cookie_id}
                  onChange={(event) => setDeleteForm({ ...deleteForm, cookie_id: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                >
                  <option value="">选择账号</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{accountNames.get(account.id)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-gray-600">
                计划名称
                <input
                  value={deleteForm.name}
                  onChange={(event) => setDeleteForm({ ...deleteForm, name: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                最少上架天数
                <input
                  type="number"
                  min="1"
                  value={deleteForm.min_publish_days}
                  onChange={(event) => setDeleteForm({ ...deleteForm, min_publish_days: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                每日候选上限
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={deleteForm.daily_limit}
                  onChange={(event) => setDeleteForm({ ...deleteForm, daily_limit: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
            </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={deleteForm.skip_reply_activity}
                    onChange={(event) => setDeleteForm({ ...deleteForm, skip_reply_activity: event.target.checked })}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  排除有自动回复活动的商品
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={deleteForm.skip_order_activity}
                    onChange={(event) => setDeleteForm({ ...deleteForm, skip_order_activity: event.target.checked })}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  排除有订单记录的商品
                </label>
              </div>
                <div className="flex gap-2">
                {deleteForm.id && (
                  <button
                    type="button"
                    onClick={() => setDeleteForm({ ...emptyDeleteForm, cookie_id: deleteForm.cookie_id })}
                    className="ios-btn-secondary rounded-md px-4 py-2.5 text-sm"
                  >
                    取消编辑
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void saveDeletePlan()}
                  disabled={busyKey === 'delete-save'}
                  className="ios-btn-primary flex items-center gap-2 rounded-md px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  {busyKey === 'delete-save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存计划
                </button>
                </div>
              </div>
            </div>
          </div>

          <div className="section-panel">
            <SectionHeader
              title="删除预演计划"
              description="所有计划均只生成候选结果，需在预演结果中人工核对。"
              actions={<span className="text-xs font-medium text-gray-500">{deleteRules.length} 条</span>}
            />
            <div className="divide-y divide-gray-100">
              {deleteRules.map((rule) => (
                <div key={rule.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,1fr)_1fr_180px_auto] lg:items-center">
                <div>
                  <div className="font-bold text-gray-900">{rule.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{accountNames.get(rule.cookie_id) || rule.cookie_id}</div>
                </div>
                <div className="text-xs leading-5 text-gray-600">
                  上架 ≥ {rule.min_publish_days} 天 · 最多 {rule.daily_limit} 件
                  <br />
                  {rule.skip_reply_activity ? '排除自动回复活动' : '不检查自动回复'} · {rule.skip_order_activity ? '排除订单' : '不检查订单'}
                </div>
                <div>
                  <span className="rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">DRY-RUN</span>
                  <div className="mt-2 text-xs text-gray-500">{formatDate(rule.last_run_at)}</div>
                </div>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    title="执行预演"
                    disabled={busyKey === `delete-preview-${rule.id}`}
                    onClick={() => void runDeletePreview(rule)}
                    className="rounded p-2 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {busyKey === `delete-preview-${rule.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                  </button>
                  <button type="button" title="编辑计划" onClick={() => editDeleteRule(rule)} className="rounded p-2 text-gray-500 hover:bg-gray-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" title="删除计划" onClick={() => void removeDeleteRule(rule)} className="rounded p-2 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                </div>
              ))}
              {deleteRules.length === 0 && <EmptyState compact title="暂无删除计划" description="创建计划后可先预演候选商品，不会直接执行删除。" icon={Trash2} />}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'repairs' && (
        <section className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              {
                key: 'repair-ids',
                title: '商品 ID 回写',
                label: '开始回写',
                icon: PackageCheck,
                action: repairPublishedProductIds,
              },
              {
                key: 'repair-links',
                title: '链接修复',
                label: '修复链接',
                icon: Link2,
                action: repairProductShortLinks,
              },
              {
                key: 'repair-cards',
                title: '卡券补偿',
                label: '补偿绑定',
                icon: CheckCircle2,
                action: compensateProductCards,
              },
            ].map((task) => {
              const Icon = task.icon;
              return (
                <div key={task.key} className="section-panel p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-yellow-50 p-2 text-amber-700"><Icon className="h-5 w-5" /></div>
                    <h3 className="font-bold text-gray-900">{task.title}</h3>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === task.key}
                    onClick={() => void runRepair(task.key, task.action)}
                    className="ios-btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm disabled:opacity-50"
                  >
                    {busyKey === task.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {task.label}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="section-panel">
            <SectionHeader
              title="执行记录"
              description="记录素材筛选、删除预演和数据补偿任务的最近运行结果。"
              actions={<span className="text-xs text-gray-500">最近 {runs.length} 条</span>}
            />
            <div className="overflow-x-auto">
              <table className="data-table responsive-data-table min-w-[820px] text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3">任务</th>
                    <th className="px-4 py-3">模式</th>
                    <th className="px-4 py-3">检查 / 命中 / 变更 / 失败</th>
                    <th className="px-4 py-3">结果</th>
                    <th className="px-4 py-3">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-4 py-3 font-bold text-gray-800" data-label="任务">{taskNames[run.task_type] || run.task_type}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500" data-label="模式">{run.execution_mode}</td>
                      <td className="px-4 py-3 text-gray-600" data-label="检查 / 命中 / 变更 / 失败">
                        {run.checked_count} / {run.matched_count} / {run.changed_count} / {run.failed_count}
                      </td>
                      <td className="max-w-md px-4 py-3 text-gray-600" data-label="结果">{run.summary || run.error_message || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500" data-label="时间">{formatDate(run.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {runs.length === 0 && <EmptyState compact title="暂无执行记录" description="执行任一自动化任务后，运行结果会显示在这里。" icon={Workflow} />}
          </div>
        </section>
      )}

      {activeTab === 'search' && (
        <SearchXianyuTab
          accounts={accounts}
          accountNames={accountNames}
          onAddToMaterials={(item) => { void item; notify('已加入素材库（请在素材库 Tab 查看）', 'success'); }}
        />
      )}

      {editingMaterial && (
        <div className="modal-overlay">
          <div className="modal-container modal-container-lg">
            <div className="modal-header flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">编辑素材</h3>
                <p className="mt-1 text-xs text-gray-500">补充本地详情、发货内容和发布回写信息。</p>
              </div>
              <button type="button" onClick={() => setEditingMaterial(null)} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="modal-body grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-gray-600 md:col-span-2">
                标题
                <input
                  value={editingMaterial.title}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, title: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                分类
                <input
                  value={editingMaterial.category}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, category: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                价格
                <input
                  type="number"
                  min="0"
                  value={editingMaterial.price ?? ''}
                  onChange={(event) => setEditingMaterial({
                    ...editingMaterial,
                    price: event.target.value === '' ? undefined : Number(event.target.value),
                  })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600 md:col-span-2">
                描述
                <textarea
                  rows={5}
                  value={editingMaterial.description}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, description: event.target.value })}
                  className="ios-input mt-1.5 w-full resize-y rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600 md:col-span-2">
                发货内容
                <textarea
                  rows={4}
                  value={editingMaterial.delivery_content}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, delivery_content: event.target.value })}
                  className="ios-input mt-1.5 w-full resize-y rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                已发布商品 ID
                <input
                  value={editingMaterial.published_item_id}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, published_item_id: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                追踪码
                <input
                  value={editingMaterial.publish_trace_code}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, publish_trace_code: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                来源链接
                <input
                  value={editingMaterial.source_url}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, source_url: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-gray-600">
                短链
                <input
                  value={editingMaterial.short_url}
                  onChange={(event) => setEditingMaterial({ ...editingMaterial, short_url: event.target.value })}
                  className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            <div className="modal-footer flex justify-end gap-2">
              <button type="button" onClick={() => setEditingMaterial(null)} className="ios-btn-secondary rounded-md px-4 py-2.5 text-sm">取消</button>
              <button
                type="button"
                onClick={() => void saveMaterial()}
                disabled={busyKey === `material-${editingMaterial.id}`}
                className="ios-btn-primary flex items-center gap-2 rounded-md px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {busyKey === `material-${editingMaterial.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-overlay">
          <div className="modal-container modal-container-lg">
            <div className="modal-header flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">删除预演结果</h3>
                <p className="mt-1 text-xs text-gray-500">{preview.summary}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="rounded p-2 text-gray-500 hover:bg-gray-100" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="modal-body grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-3 text-sm font-bold text-amber-800">候选 {preview.candidates.length}</h4>
                <div className="divide-y divide-gray-100 border-y border-gray-200">
                  {preview.candidates.map((item) => (
                    <div key={item.item_id} className="py-3">
                      <div className="font-medium text-gray-900">{item.item_title || item.item_id}</div>
                      <div className="mt-1 text-xs text-gray-500">ID {item.item_id} · {item.age_days || 0} 天 · {item.reason}</div>
                    </div>
                  ))}
                  {preview.candidates.length === 0 && <EmptyState compact title="无候选商品" />}
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-sm font-bold text-gray-700">已跳过 {preview.skipped.length}</h4>
                <div className="divide-y divide-gray-100 border-y border-gray-200">
                  {preview.skipped.map((item) => (
                    <div key={item.item_id} className="py-3">
                      <div className="font-medium text-gray-900">{item.item_title || item.item_id}</div>
                      <div className="mt-1 text-xs text-gray-500">ID {item.item_id} · {item.reason}</div>
                    </div>
                  ))}
                  {preview.skipped.length === 0 && <EmptyState compact title="无跳过记录" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 搜索咸鱼 Tab
// ============================================================
interface SearchXianyuTabProps {
  accounts: AccountDetail[];
  accountNames: Map<string, string>;
  onAddToMaterials: (item: XianyuSearchResult) => void;
}

interface SearchFormState {
  keyword: string;
  totalPages: string;
  cookieId: string;
}

const emptySearchForm: SearchFormState = { keyword: '', totalPages: '1', cookieId: '' };

/**
 * 接口返回的价格是「¥1.43」这种带币种的字符串，直接写进 CSV 会被 Excel
 * 当成文本，没法求和排序。这里剥掉币种只留数字；解析不出来就留空单元格。
 */
const priceToNumber = (price: string): number | null => {
  const matched = String(price ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : null;
};

/** 批量导出和单条导出共用同一份列定义，两种 CSV 的表头和列序保持一致。 */
const SEARCH_EXPORT_COLUMNS: CsvColumn<XianyuSearchResult>[] = [
  { header: '商品ID', value: (item) => item.item_id },
  { header: '品名', value: (item) => item.title },
  { header: '价格', value: (item) => priceToNumber(item.price) },
  { header: '图片链接', value: (item) => item.main_image },
  { header: '商品链接', value: (item) => item.item_url },
  { header: '卖家昵称', value: (item) => item.seller_name },
];

// ============================================================
// 搜索历史缓存（浏览器 localStorage）
// ============================================================
//
// 结果区原先只活在 useState 里，而 SearchXianyuTab 是条件渲染的（见上面
// `activeTab === 'search' && ...`），所以切一次页签就会卸载重建、结果全丢，
// 刷新和重启 app 更是必丢。丢一次就得重搜一次，而每次搜索都在消耗风控额度——
// 缓存的真正价值是省账号风险，不只是省事。
//
// key 带版本后缀：将来数据形状变了直接改 key，不做迁移，读到旧 key 只会被
// 当成「没有缓存」。命名沿用 MessageManagement.tsx 的惯例。
const SEARCH_CACHE_KEY = 'xianyu-search-cache-v1';
const MAX_SEARCH_CACHE_ENTRIES = 5;

interface SearchCacheEntry {
  /** 搜索完成时间（ms）。既是标签行的排序键，也是相对时间的展示源。 */
  savedAt: number;
  keyword: string;
  totalPages: number;
  cookieId: string;
  /** 服务端返回的总数，不等于 results.length；结果区「共 N 件」用的是它。 */
  total: number;
  results: XianyuSearchResult[];
  /** 搜索成功但部分分页失败时后端会带 error，恢复时要一起还原。 */
  warning?: string;
}

/**
 * 这几条是渲染路径上的硬依赖：item_id 当 React key，item_url 当 href，
 * tags 会直接取 [0] 当文案——tags 不是数组的话 `item.tags[0]` 会抛异常。
 * 其余字段即使缺失也只是渲染成空，不必校验。
 */
const isValidCachedItem = (value: unknown): value is XianyuSearchResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<XianyuSearchResult>;
  return typeof item.item_id === 'string'
    && typeof item.item_url === 'string'
    && typeof item.title === 'string'
    && Array.isArray(item.tags)
    && (item.tags.length === 0 || typeof item.tags[0] === 'string');
};

const loadSearchCache = (): SearchCacheEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_CACHE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is SearchCacheEntry => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const entry = value as Partial<SearchCacheEntry>;
        return Number.isFinite(entry.savedAt)
          && typeof entry.keyword === 'string'
          && entry.keyword.length > 0
          && Number.isFinite(entry.totalPages)
          && typeof entry.cookieId === 'string'
          && Number.isFinite(entry.total)
          && Array.isArray(entry.results)
          && entry.results.every(isValidCachedItem);
      })
      // 正常写入时本来就是新的在前，这里再排一次：万一被手工改坏，
      // 不至于把一条很旧的历史当成「最近一次」自动恢复。
      .sort((left, right) => right.savedAt - left.savedAt)
      .slice(0, MAX_SEARCH_CACHE_ENTRIES);
  } catch {
    return [];
  }
};

/** 单次写入。失败返回 false，由调用方决定怎么退让。 */
const writeSearchCache = (entries: SearchCacheEntry[]): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
};

const saveSearchCache = (entries: SearchCacheEntry[]) => {
  if (typeof window === 'undefined') return;
  const capped = entries.slice(0, MAX_SEARCH_CACHE_ENTRIES);
  if (writeSearchCache(capped)) return;

  // 配额不足。先把旧值删掉，把这份 key 自己占的字节还回去——否则在
  // 「旧值尚未被替换」的瞬间，缩减后的新值仍然可能超配额，白白重试。
  try {
    window.localStorage.removeItem(SEARCH_CACHE_KEY);
  } catch {
    return;
  }
  // 从后往前丢，保证最新一次搜索一定落盘。
  //
  // 这里不能像 MessageManagement 那样直接吞掉异常：setItem 抛错时 key 会
  // 保留旧内容，下次搜索构造同样 5 条、再抛、再保留旧的——用户会看到一个
  // 永远不更新的标签行，恢复出越来越旧的结果，而且界面上没有任何提示。
  // 隐私模式下 setItem 每次必抛，循环会一路缩到 0 条退出，此时静默放弃，
  // 当前会话内的 state 仍然可用。
  let keep = capped.length;
  while (keep > 0) {
    if (writeSearchCache(capped.slice(0, keep))) return;
    keep -= 1;
  }
};

/** 同一组（关键词, 页数, 账号）算同一次搜索。分隔符用 \u0000，
 *  避免关键词里含分隔符时被拼串撞车（沿用 MessageManagement 的写法）。 */
const searchCacheKey = (entry: Pick<SearchCacheEntry, 'keyword' | 'totalPages' | 'cookieId'>) =>
  `${entry.keyword}\u0000${entry.totalPages}\u0000${entry.cookieId}`;

/** 同 key 只保留最新一次；新条目永远排在最前。 */
const mergeSearchCache = (list: SearchCacheEntry[], entry: SearchCacheEntry): SearchCacheEntry[] => {
  const key = searchCacheKey(entry);
  return [entry, ...list.filter((item) => searchCacheKey(item) !== key)]
    .slice(0, MAX_SEARCH_CACHE_ENTRIES);
};

/** 标签行上的相对时间。超过一周就不再有意义，退回绝对日期。 */
const formatRelativeTime = (savedAt: number, now: number = Date.now()): string => {
  if (!Number.isFinite(savedAt)) return '';
  const diffMs = now - savedAt;
  // 系统时钟被回拨时 savedAt 会落在「未来」，别渲染成「-3分钟前」。
  if (diffMs < 0) return '刚刚';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}天前`;
  return new Date(savedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const SearchXianyuTab: React.FC<SearchXianyuTabProps> = ({ accounts, accountNames }) => {
  // 挂载时只读一次 localStorage，所有初值都从这一份派生，避免几个 useState
  // 各读各的、读出不一致的快照。
  //
  // 用惰性初始化而不是 useState([]) + useEffect 恢复：结果区的渲染条件是
  // `results.length > 0 || searching`、空状态是 `!searching && results.length === 0
  // && !error`，用 effect 的话首帧会先画一次「暂无搜索结果」再被结果替换，每次
  // 挂载都闪一下。这里首帧就是对的。
  //
  // StrictMode 在开发环境会把初始化函数跑两次；这里是纯读、无副作用，安全。
  // 也因此不要在初始化器里写回 localStorage。
  const [initialCache] = useState(loadSearchCache);
  const restored = initialCache[0] ?? null;

  const [form, setForm] = useState<SearchFormState>(() => (restored
    ? { keyword: restored.keyword, totalPages: String(restored.totalPages), cookieId: restored.cookieId }
    : emptySearchForm));
  const [history, setHistory] = useState<SearchCacheEntry[]>(initialCache);
  const historyRef = useRef(initialCache);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<XianyuSearchResult[]>(() => restored?.results ?? []);
  const [total, setTotal] = useState(() => restored?.total ?? 0);
  const [error, setError] = useState(() => restored?.warning ?? '');
  const [keyword, setKeyword] = useState(() => restored?.keyword ?? '');

  // 每次搜索领一个号。号对不上说明这次结果已经作废（用户点了历史标签，
  // 或又发起了新搜索）——异步回来的响应不能再往下写。
  const searchSeqRef = useRef(0);

  /** history 的唯一写入口：state、ref、localStorage 一起更新。
   *  用 ref 镜像是因为 doSearch 是异步的，闭包里的 history 会是旧快照。 */
  const commitHistory = (next: SearchCacheEntry[]) => {
    historyRef.current = next;
    setHistory(next);
    saveSearchCache(next);
  };

  const restoreEntry = (entry: SearchCacheEntry) => {
    // 作废仍在飞行中的搜索：它回来时 seq 对不上，不会再覆盖刚恢复的结果。
    searchSeqRef.current += 1;
    setSearching(false);
    setError(entry.warning ?? '');
    setResults(entry.results);
    setTotal(entry.total);
    setKeyword(entry.keyword);
    setForm({
      keyword: entry.keyword,
      totalPages: String(entry.totalPages),
      cookieId: entry.cookieId,
    });
    // 刻意不刷新 savedAt：那会让标签行每次点击都重排序，还会把一条老数据
    // 标成「刚刚」——数据不是刚拿到的，那是假的。
  };

  const doSearch = async () => {
    const trimmedKeyword = form.keyword.trim();
    if (!trimmedKeyword) { notify('请输入搜索关键词', 'warning'); return; }
    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    setSearching(true);
    setError('');
    setResults([]);
    setTotal(0);
    // 用 trim 过的串：标题和 CSV 文件名都取自它，不能带上用户的空格。
    setKeyword(trimmedKeyword);
    try {
      const pages = parseInt(form.totalPages) || 1;
      const resp = pages > 1
        ? await searchXianyuItemsMultiple(trimmedKeyword, pages)
        : await searchXianyuItems(trimmedKeyword, 1, 20);
      if (seq !== searchSeqRef.current) return;  // 已被「恢复历史」作废
      if (resp.success) {
        const data = resp.data || [];
        const nextTotal = resp.total || 0;
        setResults(data);
        setTotal(nextTotal);
        if (resp.error) setError(resp.error);

        // 搜到 0 条也缓存：缓存该还原真实的上次状态，而不是挑好看的。
        // 跳过的话，重启后会自动恢复成「再上一次」的搜索，具有误导性。
        const entry: SearchCacheEntry = {
          savedAt: Date.now(),
          keyword: trimmedKeyword,
          totalPages: pages,
          cookieId: form.cookieId,
          total: nextTotal,
          warning: resp.error || undefined,
          results: data,
        };
        commitHistory(mergeSearchCache(historyRef.current, entry));
      } else {
        setError(resp.error || '搜索失败');
      }
    } catch (e) {
      if (seq !== searchSeqRef.current) return;
      setError((e as Error).message);
    } finally {
      // 也要判 seq：否则先发的搜索会把后发搜索的转圈关掉。
      if (seq === searchSeqRef.current) setSearching(false);
    }
  };

  const removeEntry = (entry: SearchCacheEntry) => {
    commitHistory(historyRef.current.filter(
      (item) => searchCacheKey(item) !== searchCacheKey(entry),
    ));
  };

  const clearHistory = () => {
    if (historyRef.current.length === 0) return;
    commitHistory([]);
    notify('已清空搜索历史', 'success');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => notify('已复制到剪贴板', 'success'));
  };

  const exportItems = (items: XianyuSearchResult[], filename: string) => {
    if (items.length === 0) { notify('没有可导出的商品', 'warning'); return; }
    downloadCsv(filename, buildCsv(items, SEARCH_EXPORT_COLUMNS));
    notify(`已导出 ${items.length} 件商品`, 'success');
  };

  return (
    <section className="space-y-4">
      {/* 搜索表单 */}
      <div className="section-panel">
        <SectionHeader
          title="搜索咸鱼商品"
          description="输入关键词，从闲鱼实时抓取商品列表。按「想要人数」倒序排列。"
          icon={FileSearch}
        />
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-48">
              <span className="text-xs font-bold text-gray-600">搜索关键词</span>
              <input
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void doSearch()}
                placeholder="输入商品关键词"
                className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
              />
            </label>
            <label className="w-28">
              <span className="text-xs font-bold text-gray-600">搜索页数</span>
              <input
                type="number"
                min="1"
                max="20"
                value={form.totalPages}
                onChange={(e) => setForm({ ...form, totalPages: e.target.value })}
                className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
              />
            </label>
            <label className="w-44">
              <span className="text-xs font-bold text-gray-600">使用账号</span>
              <select
                value={form.cookieId}
                onChange={(e) => setForm({ ...form, cookieId: e.target.value })}
                className="ios-input mt-1.5 w-full rounded-md px-3 py-2.5 text-sm"
              >
                <option value="">自动选择</option>
                {/* accounts 是父组件异步取的，首帧通常是空的，所以没法规校缓存里的
                    cookieId。恢复一条已被删账号的历史时，select 的 value 找不到对应
                    option 会显示成「自动选择」，但 state 里其实是个幽灵值。补一个
                    占位 option 既让状态可见，也告诉用户为什么。 */}
                {form.cookieId && !accounts.some((a) => a.id === form.cookieId) && (
                  <option value={form.cookieId}>（账号已失效）</option>
                )}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{accountNames.get(a.id) || a.id}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void doSearch()}
              disabled={searching}
              className="ios-btn-primary flex items-center gap-2 rounded-md px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? '搜索中...' : '开始搜索'}
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
          )}
          {/* 放在表单面板里而不是结果面板旁边：结果面板是条件渲染的，而这一行
              必须在本次会话还没搜过时就可见——那正是恢复的意义。 */}
          {history.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-500">最近搜索</span>
              {history.map((entry) => (
                <span
                  key={searchCacheKey(entry)}
                  className="inline-flex max-w-full items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600"
                >
                  {/* 「恢复」和「删除」必须是兄弟 button：button 套 button 是非法
                      HTML，键盘和读屏都会坏。 */}
                  <button
                    type="button"
                    onClick={() => restoreEntry(entry)}
                    title={`恢复「${entry.keyword}」的搜索结果（共 ${entry.total} 件）`}
                    className="flex min-w-0 items-center gap-1 rounded px-0.5 hover:bg-gray-200"
                  >
                    {/* truncate 只加在关键词上，不加在 button 上：否则时间要一起被截掉 */}
                    <span className="max-w-40 truncate font-medium text-gray-700">{entry.keyword}</span>
                    <span className="shrink-0 text-gray-400">
                      {formatRelativeTime(entry.savedAt)} · {entry.results.length}件
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry)}
                    title={`删除「${entry.keyword}」的搜索缓存`}
                    className="shrink-0 rounded p-0.5 hover:bg-gray-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearHistory}
                className="ml-1 text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
              >
                清空
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 搜索结果 */}
      {(results.length > 0 || searching) && (
        <div className="section-panel">
          <SectionHeader
            title={`搜索结果「${keyword}」`}
            description={`共获取 ${total} 件商品，按想要人数倒序`}
            actions={
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-500">
                  {results.length} 件已加载
                  {total > results.length ? ` · 共 ${total} 件` : ''}
                </span>
                <button
                  type="button"
                  disabled={results.length === 0}
                  onClick={() => exportItems(
                    results,
                    `闲鱼搜索结果_${safeFilenamePart(keyword)}_${results.length}件.csv`,
                  )}
                  className="ios-btn-secondary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> 导出 CSV
                </button>
              </div>
            }
            icon={FileSearch}
          />
          <div className="divide-y divide-gray-100">
            {results.length === 0 && searching && (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" /> 加载中...
              </div>
            )}
            {results.map((item) => (
              <div key={item.item_id} className="flex items-start gap-3 p-4 hover:bg-gray-50">
                <div className="h-16 w-16 flex-none overflow-hidden rounded bg-gray-100">
                  {item.main_image ? (
                    <img
                      src={item.main_image}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <FileSearch className="m-4 h-8 w-8 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={item.item_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block max-w-2xl truncate font-bold text-gray-900 hover:text-blue-600"
                      >
                        {item.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-bold text-orange-500">{item.price}</span>
                        {item.tags[0] && <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-600">{item.tags[0]}</span>}
                        <span>{item.area}</span>
                        <span>{item.publish_time}</span>
                        <span className="font-mono">{item.seller_name}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        title="复制链接"
                        onClick={() => copyToClipboard(item.item_url)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="导出这件商品"
                        onClick={() => exportItems([item], `闲鱼商品_${safeFilenamePart(item.item_id)}.csv`)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <a
                        href={item.item_url}
                        target="_blank"
                        rel="noreferrer"
                        title="打开商品"
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!searching && results.length === 0 && !error && (
        <EmptyState
          compact
          title="暂无搜索结果"
          description="输入关键词后点击「开始搜索」，从闲鱼实时获取商品列表。"
          icon={FileSearch}
        />
      )}
    </section>
  );
};

export default ProductAutomation;
