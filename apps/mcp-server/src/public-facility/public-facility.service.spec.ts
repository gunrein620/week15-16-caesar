import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicFacilityService } from './public-facility.service.js';

describe('PublicFacilityService', () => {
  const originalMapKey = process.env.MAP_API_KEY;

  afterEach(() => {
    process.env.MAP_API_KEY = originalMapKey;
    vi.unstubAllGlobals();
  });

  it('returns mock public facilities when no map API key exists', async () => {
    process.env.MAP_API_KEY = '';
    const service = new PublicFacilityService();

    const result = await service.searchPublicFacility({ region: '오산', keyword: '도서관' });

    expect(result.source).toBe('mock');
    expect(result.facilities).toEqual([
      {
        name: '오산시 중앙도서관',
        category: '도서관',
        address: '경기도 오산시 운암로 85'
      }
    ]);
  });

  it('calls Kakao Local keyword search and maps place documents when a map key exists', async () => {
    process.env.MAP_API_KEY = 'kakao-rest-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            place_name: '오산시 중앙도서관',
            category_group_name: '공공기관',
            road_address_name: '경기 오산시 운암로 85',
            address_name: '경기 오산시 오산동 1',
            place_url: 'https://place.map.kakao.com/1',
            x: '127.0772',
            y: '37.1498'
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new PublicFacilityService();

    const result = await service.searchPublicFacility({ region: '오산', keyword: '도서관' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://dapi.kakao.com/v2/local/search/keyword.json'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'KakaoAK kakao-rest-key'
        })
      })
    );
    expect(result.source).toBe('kakao-local');
    expect(result.facilities[0]).toMatchObject({
      name: '오산시 중앙도서관',
      category: '공공기관',
      address: '경기 오산시 운암로 85',
      url: 'https://place.map.kakao.com/1'
    });
  });

  it('falls back to mock facilities when Kakao Local fails', async () => {
    process.env.MAP_API_KEY = 'kakao-rest-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const service = new PublicFacilityService();

    const result = await service.searchPublicFacility({ region: '오산', keyword: '도서관' });

    expect(result.source).toBe('mock');
    expect(result).toMatchObject({
      error: expect.stringContaining('network down')
    });
  });
});
