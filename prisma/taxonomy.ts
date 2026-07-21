/**
 * Fixed taxonomy shared by the seed and any test fixtures.
 * Keeping it explicit (instead of fully random faker categories) makes facets,
 * filters and relevance ranking meaningful and reproducible.
 */
export interface CategoryDefinition {
  name: string;
  subcategories: string[];
  /** Sample nouns used to build realistic product names for this category. */
  items: string[];
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    name: 'Electronics',
    subcategories: ['Smartphones', 'Laptops', 'Headphones', 'Cameras', 'Wearables'],
    items: ['Phone', 'Laptop', 'Headphones', 'Camera', 'Smartwatch', 'Tablet', 'Monitor'],
  },
  {
    name: 'Home & Kitchen',
    subcategories: ['Cookware', 'Furniture', 'Lighting', 'Appliances', 'Decor'],
    items: ['Blender', 'Sofa', 'Lamp', 'Coffee Maker', 'Knife Set', 'Chair', 'Toaster'],
  },
  {
    name: 'Sports & Outdoors',
    subcategories: ['Fitness', 'Camping', 'Cycling', 'Running', 'Water Sports'],
    items: ['Tent', 'Bicycle', 'Yoga Mat', 'Dumbbell', 'Kayak', 'Running Shoes', 'Backpack'],
  },
  {
    name: 'Fashion',
    subcategories: ['Men', 'Women', 'Kids', 'Shoes', 'Accessories'],
    items: ['Jacket', 'Sneakers', 'Dress', 'Watch', 'Sunglasses', 'Backpack', 'T Shirt'],
  },
  {
    name: 'Books',
    subcategories: ['Fiction', 'Non Fiction', 'Comics', 'Children', 'Technical'],
    items: ['Novel', 'Cookbook', 'Biography', 'Graphic Novel', 'Textbook', 'Guide'],
  },
  {
    name: 'Beauty',
    subcategories: ['Skincare', 'Makeup', 'Fragrance', 'Hair Care', 'Tools'],
    items: ['Moisturizer', 'Lipstick', 'Perfume', 'Shampoo', 'Serum', 'Hair Dryer'],
  },
];

export const LOCATIONS: string[] = [
  'Madrid',
  'Barcelona',
  'Valencia',
  'Seville',
  'Bilbao',
  'Malaga',
  'Zaragoza',
  'Lisbon',
  'Porto',
  'Paris',
];

export const BRANDS: string[] = [
  'Aurora',
  'Nordic',
  'Vertex',
  'Lumen',
  'Cobalt',
  'Summit',
  'Zephyr',
  'Onyx',
  'Pulse',
  'Terra',
];
