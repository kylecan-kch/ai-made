import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Mail,
  Building,
  Briefcase,
  MapPin,
  Calendar,
  Globe,
  Tag,
  FileText,
  Copy,
  Check,
  Edit2,
  Trash2,
  Plus,
  Save,
  Sparkles,
  Code,
} from 'lucide-react';
import { Contact, PhoneEntry, EmailEntry } from '../types/contact';
import { generateVCard, splitFullName } from '../utils/vcard';

interface ContactDrawerProps {
  contact: Contact | null;
  isOpen: boolean;
  isEditing: boolean;
  onClose: () => void;
  onSave: (updated: Contact) => void;
  onDelete: (id: string) => void;
}

export const ContactDrawer: React.FC<ContactDrawerProps> = ({
  contact,
  isOpen,
  isEditing: initialEditing,
  onClose,
  onSave,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showVcardRaw, setShowVcardRaw] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Contact | null>(null);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (contact) {
      setFormData(JSON.parse(JSON.stringify(contact)));
      setIsEditing(initialEditing);
      setShowVcardRaw(false);
    } else {
      setFormData(null);
    }
  }, [contact, initialEditing]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !formData) return null;

  const copyValue = (val: string, fieldName: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAutoSplitName = () => {
    if (!formData.fullName) return;
    const split = splitFullName(formData.fullName);
    setFormData({
      ...formData,
      familyName: split.familyName,
      givenName: split.givenName,
    });
  };

  const handleAddPhone = () => {
    setFormData({
      ...formData,
      phones: [...formData.phones, { number: '', type: 'CELL' }],
    });
  };

  const handleRemovePhone = (index: number) => {
    setFormData({
      ...formData,
      phones: formData.phones.filter((_, i) => i !== index),
    });
  };

  const handlePhoneChange = (index: number, field: keyof PhoneEntry, value: any) => {
    const updated = [...formData.phones];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, phones: updated });
  };

  const handleAddEmail = () => {
    setFormData({
      ...formData,
      emails: [...formData.emails, { address: '', type: 'WORK' }],
    });
  };

  const handleRemoveEmail = (index: number) => {
    setFormData({
      ...formData,
      emails: formData.emails.filter((_, i) => i !== index),
    });
  };

  const handleEmailChange = (index: number, field: keyof EmailEntry, value: any) => {
    const updated = [...formData.emails];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, emails: updated });
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !formData.categories.includes(trimmed)) {
      setFormData({
        ...formData,
        categories: [...formData.categories, trimmed],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      categories: formData.categories.filter(t => t !== tagToRemove),
    });
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() && formData.phones.length === 0) {
      alert('请至少填写联系人姓名或电话号码！');
      return;
    }
    // Update fullAddress
    const adr = formData.address;
    const full = [adr.country, adr.region, adr.city, adr.street].filter(Boolean).join(' ');
    const toSave: Contact = {
      ...formData,
      address: {
        ...formData.address,
        fullAddress: full || adr.street,
      },
    };
    onSave(toSave);
    setIsEditing(false);
  };

  const rawVCardString = generateVCard([formData], { version: '3.0', encoding: 'utf-8' });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              {(formData.fullName || '联').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isEditing ? (formData.id.startsWith('c_new_') ? '新建联系人' : '编辑联系人详细信息') : formData.fullName}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isEditing ? '格式1 表格字段与 vCard 实时映射' : formData.jobTitle || formData.organization || '联系人详情'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要删除此联系人吗？')) {
                      onDelete(formData.id);
                      onClose();
                    }
                  }}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 cursor-pointer"
                  title="删除联系人"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isEditing ? (
            /* EDIT FORM */
            <form onSubmit={handleSaveForm} id="contact-edit-form" className="space-y-5 text-xs">
              {/* Name Fields */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">姓名信息</span>
                  <button
                    type="button"
                    onClick={handleAutoSplitName}
                    className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    根据全名自动拆分姓/名
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-slate-600 mb-1 font-medium">完整姓名 (FN) *</label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="如: 张伟"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">姓氏 (Family Name)</label>
                    <input
                      type="text"
                      value={formData.familyName}
                      onChange={e => setFormData({ ...formData, familyName: e.target.value })}
                      placeholder="如: 张"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">名字 (Given Name)</label>
                    <input
                      type="text"
                      value={formData.givenName}
                      onChange={e => setFormData({ ...formData, givenName: e.target.value })}
                      placeholder="如: 伟"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Phone Numbers */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    电话号码 ({formData.phones.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddPhone}
                    className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    添加电话
                  </button>
                </div>

                {formData.phones.length === 0 ? (
                  <p className="text-slate-400 italic">暂无电话，点击上方添加</p>
                ) : (
                  formData.phones.map((phone, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={phone.type}
                        onChange={e => handlePhoneChange(idx, 'type', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                      >
                        <option value="CELL">手机</option>
                        <option value="WORK">工作</option>
                        <option value="HOME">住宅</option>
                        <option value="MAIN">主要</option>
                        <option value="OTHER">其他</option>
                      </select>
                      <input
                        type="text"
                        value={phone.number}
                        onChange={e => handlePhoneChange(idx, 'number', e.target.value)}
                        placeholder="电话号码"
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhone(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Emails */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                    电子邮箱 ({formData.emails.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    添加邮箱
                  </button>
                </div>

                {formData.emails.length === 0 ? (
                  <p className="text-slate-400 italic">暂无邮箱，点击上方添加</p>
                ) : (
                  formData.emails.map((email, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={email.type}
                        onChange={e => handleEmailChange(idx, 'type', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                      >
                        <option value="WORK">工作</option>
                        <option value="HOME">个人</option>
                        <option value="OTHER">其他</option>
                      </select>
                      <input
                        type="email"
                        value={email.address}
                        onChange={e => handleEmailChange(idx, 'address', e.target.value)}
                        placeholder="邮箱地址"
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Company & Job */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-amber-600" />
                  公司与职业
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">公司/组织</label>
                    <input
                      type="text"
                      value={formData.organization}
                      onChange={e => setFormData({ ...formData, organization: e.target.value })}
                      placeholder="公司名称"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">部门</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={e => setFormData({ ...formData, department: e.target.value })}
                      placeholder="如: 研发部"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">职位/头衔</label>
                    <input
                      type="text"
                      value={formData.jobTitle}
                      onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                      placeholder="如: 架构师"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  地址信息
                </span>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={formData.address.street}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, street: e.target.value },
                      })
                    }
                    placeholder="详细街道门牌地址"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      value={formData.address.city}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, city: e.target.value },
                        })
                      }
                      placeholder="城市 (如: 北京市)"
                      className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={formData.address.region}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, region: e.target.value },
                        })
                      }
                      placeholder="省份/地区"
                      className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={formData.address.postalCode}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, postalCode: e.target.value },
                        })
                      }
                      placeholder="邮政编码"
                      className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={formData.address.country}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, country: e.target.value },
                        })
                      }
                      placeholder="国家 (如: 中国)"
                      className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Tags, Birthday, Website */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <span className="font-bold text-slate-800">分类与标签</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="输入标签名称并按回车添加..."
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 font-medium cursor-pointer"
                  >
                    添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.categories.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 flex items-center gap-1 font-medium text-[11px]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-rose-600 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">生日</label>
                    <input
                      type="date"
                      value={formData.birthday}
                      onChange={e => setFormData({ ...formData, birthday: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">个人网址 / URL</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={e => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <label className="block font-bold text-slate-800">备注信息</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="填写关于该联系人的备注、备忘或合作事项..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </form>
          ) : (
            /* VIEW MODE */
            <div className="space-y-5 text-xs">
              {/* Profile Card */}
              <div className="bg-linear-to-br from-blue-50 to-indigo-50/50 p-5 rounded-2xl border border-blue-100 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {formData.fullName}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 text-slate-600">
                    {formData.organization && <span>{formData.organization}</span>}
                    {formData.department && <span>· {formData.department}</span>}
                    {formData.jobTitle && (
                      <span className="font-semibold text-blue-700">({formData.jobTitle})</span>
                    )}
                  </div>
                  {(formData.familyName || formData.givenName) && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      结构化姓名: 姓 [{formData.familyName || '-'}] 名 [{formData.givenName || '-'}]
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVcardRaw(!showVcardRaw)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-white px-2 py-1 rounded-md border border-blue-200 shadow-2xs hover:bg-blue-50 cursor-pointer"
                  >
                    <Code className="w-3 h-3" />
                    {showVcardRaw ? '隐藏 vCard 源码' : '查看 vCard 源码'}
                  </button>
                </div>
              </div>

              {/* Raw VCard Code Viewer */}
              {showVcardRaw && (
                <div className="bg-slate-900 rounded-xl p-3 text-slate-100 font-mono text-[11px] space-y-2 border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                    <span>RFC 2426 vCard 3.0 数据预览</span>
                    <button
                      onClick={() => copyValue(rawVCardString, 'vcard_raw')}
                      className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'vcard_raw' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      复制代码
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre">{rawVCardString}</pre>
                </div>
              )}

              {/* Phones List */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  电话号码
                </span>
                {formData.phones.length === 0 ? (
                  <p className="text-slate-400 italic">未记录电话</p>
                ) : (
                  formData.phones.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                          {p.type === 'CELL' ? '手机' : p.type === 'WORK' ? '工作' : p.type === 'HOME' ? '住宅' : '其他'}
                        </span>
                        <span className="font-mono text-sm font-semibold text-slate-800">
                          {p.number}
                        </span>
                      </div>
                      <button
                        onClick={() => copyValue(p.number, `phone_${idx}`)}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 cursor-pointer"
                        title="复制号码"
                      >
                        {copiedField === `phone_${idx}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Emails List */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  电子邮箱
                </span>
                {formData.emails.length === 0 ? (
                  <p className="text-slate-400 italic">未记录邮箱</p>
                ) : (
                  formData.emails.map((e, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium">
                          {e.type === 'WORK' ? '工作' : e.type === 'HOME' ? '个人' : '其他'}
                        </span>
                        <span className="text-xs font-medium text-slate-800">{e.address}</span>
                      </div>
                      <button
                        onClick={() => copyValue(e.address, `email_${idx}`)}
                        className="p-1 rounded text-slate-400 hover:text-indigo-600 cursor-pointer"
                        title="复制邮箱"
                      >
                        {copiedField === `email_${idx}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Address */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  地址
                </span>
                <p className="text-slate-700 leading-relaxed">
                  {formData.address.fullAddress || formData.address.street || '未记录详细地址'}
                </p>
                {(formData.address.city || formData.address.region || formData.address.postalCode) && (
                  <div className="flex gap-2 text-[11px] text-slate-400 pt-1">
                    {formData.address.country && <span>国家: {formData.address.country}</span>}
                    {formData.address.city && <span>城市: {formData.address.city}</span>}
                    {formData.address.postalCode && <span>邮编: {formData.address.postalCode}</span>}
                  </div>
                )}
              </div>

              {/* Tags & Categories */}
              {formData.categories.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Tag className="w-4 h-4 text-amber-600" />
                    分组标签
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.categories.map(cat => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Birthday & Website */}
              {(formData.birthday || formData.website) && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 gap-4">
                  {formData.birthday && (
                    <div>
                      <span className="text-slate-400 block mb-0.5">生日</span>
                      <span className="font-semibold text-slate-800">{formData.birthday}</span>
                    </div>
                  )}
                  {formData.website && (
                    <div>
                      <span className="text-slate-400 block mb-0.5">个人网址</span>
                      <a
                        href={formData.website}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-blue-600 hover:underline truncate block"
                      >
                        {formData.website}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {formData.notes && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                    <FileText className="w-4 h-4 text-purple-600" />
                    备注信息
                  </span>
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {formData.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {isEditing && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (formData.id.startsWith('c_new_')) {
                  onClose();
                } else {
                  setIsEditing(false);
                }
              }}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              form="contact-edit-form"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              保存联系人
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
