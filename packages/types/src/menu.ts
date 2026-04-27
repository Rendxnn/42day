export type Product = {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  category?: string;
  imageUrl?: string;
  isActive: boolean;
};

export type Location = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  deliveryFeeFixed: number;
  isActive: boolean;
};

export type MenuStatus = "draft" | "published" | "archived";

export type Menu = {
  id: string;
  locationId: string;
  date: string;
  name: string;
  status: MenuStatus;
  publishedAt?: string;
};

export type MenuItem = {
  id: string;
  menuId: string;
  productId?: string;
  comboId?: string;
  displayName?: string;
  priceOverride?: number;
  availableQuantity?: number;
  isAvailable: boolean;
  sortOrder: number;
  product?: Product;
};

export type TodayMenuPayload = {
  tenantSlug: string;
  tenantSchema: string;
  requestedDate?: string;
  isFallbackMenu?: boolean;
  location?: Location;
  menu?: Menu;
  items: MenuItem[];
  products: Product[];
};
