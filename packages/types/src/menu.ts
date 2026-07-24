export type ProductType = "simple" | "composite";

export type ProductOptionType = "single" | "multiple" | "text";

export type ProductOptionValue = {
  id?: string;
  code?: string;
  name: string;
  description?: string;
  aliases?: string[];
  priceDelta: number;
  isActive: boolean;
  sortOrder: number;
};

export type ProductOption = {
  id?: string;
  code?: string;
  name: string;
  description?: string;
  aliases?: string[];
  type: ProductOptionType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  displayMode?: "list" | "buttons" | "swatches" | "text";
  values: ProductOptionValue[];
};

export type Product = {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  category?: string;
  emoji?: string;
  imageUrl?: string;
  aliases?: string[];
  productType?: ProductType;
  options?: ProductOption[];
  isActive: boolean;
};

export type ProductCategory = {
  id: string;
  name: string;
  emoji: string;
};

export type Location = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  deliveryFeeFixed: number;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  automationEnabled?: boolean;
  latitude?: number;
  longitude?: number;
  restaurantCity?: string;
  restaurantDepartment?: string;
  restaurantCountry?: string;
  deliveryRadiusKm?: number;
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
  aliases?: string[];
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
  categories: ProductCategory[];
};

export type PublicCartaPayload = {
  tenant: {
    name: string;
    slug: string;
  };
  requestedDate?: string;
  generatedAt: string;
  location?: Location;
  menu?: Menu;
  items: MenuItem[];
};
