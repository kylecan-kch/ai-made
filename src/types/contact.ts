/**
 * Contact data model and tabular Format 1 representations
 */

export interface PhoneEntry {
  number: string;
  type: 'CELL' | 'WORK' | 'HOME' | 'MAIN' | 'OTHER';
}

export interface EmailEntry {
  address: string;
  type: 'WORK' | 'HOME' | 'OTHER';
}

export interface AddressEntry {
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  fullAddress?: string;
}

export interface Contact {
  id: string;
  fullName: string;
  familyName: string;
  givenName: string;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  organization: string;
  department: string;
  jobTitle: string;
  address: AddressEntry;
  notes: string;
  birthday: string;
  website: string;
  categories: string[];
  photo?: string;
}

/**
 * Standard Format 1 (格式1) - Flat structure designed for Excel/CSV/Table representation
 */
export interface Format1Row {
  '姓名'?: string;
  '姓氏'?: string;
  '名字'?: string;
  '主要电话'?: string;
  '电话类型1'?: string;
  '备用电话'?: string;
  '电话类型2'?: string;
  '电子邮箱'?: string;
  '公司/组织'?: string;
  '部门'?: string;
  '职位'?: string;
  '详细地址'?: string;
  '城市'?: string;
  '省份/地区'?: string;
  '邮编'?: string;
  '国家'?: string;
  '备注信息'?: string;
  '生日'?: string;
  '网址'?: string;
  '分组标签'?: string;
}

export interface VCardExportOptions {
  version: '3.0' | '2.1' | '4.0';
  encoding: 'utf-8' | 'quoted-printable';
  includeEmptyFields?: boolean;
}
