export const DEFAULT_REGION_CODE = 'OSAN';
export const DEFAULT_REGION_NAME = '오산';

export type ApiPage<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
