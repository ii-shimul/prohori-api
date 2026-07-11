export interface CatalogArea {
  code: string;
  id: string;
  name: string;
  parentId: string | null;
}

export interface CatalogOutlet {
  area: CatalogArea;
  code: string;
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  tier: number;
  timezone: string;
}

export interface CatalogProvider {
  code: 'PROVIDER_A' | 'PROVIDER_B' | 'PROVIDER_C';
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}
