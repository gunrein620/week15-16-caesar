import { Injectable } from '@nestjs/common';

export type PublicFacilityInput = {
  region: string;
  keyword?: string;
};

@Injectable()
export class PublicFacilityService {
  async searchPublicFacility(input: PublicFacilityInput) {
    const mapKey = process.env.MAP_API_KEY;
    if (mapKey) {
      try {
        const query = [input.region, input.keyword ?? '공공시설'].join(' ');
        const params = new URLSearchParams({
          query,
          size: '5'
        });
        const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
          headers: {
            Authorization: `KakaoAK ${mapKey}`
          }
        });
        if (!response.ok) {
          throw new Error(`Kakao Local request failed: ${response.status} ${await response.text()}`);
        }
        const data = (await response.json()) as KakaoKeywordResponse;
        return {
          summary: `${input.region} 장소 검색 결과입니다.`,
          facilities: (data.documents ?? []).map((place) => ({
            name: place.place_name,
            category: place.category_group_name || place.category_name || '장소',
            address: place.road_address_name || place.address_name,
            url: place.place_url,
            longitude: Number(place.x),
            latitude: Number(place.y)
          })),
          source: 'kakao-local'
        };
      } catch (error) {
        return {
          ...this.mockFacilities(input),
          error: errorMessage(error)
        };
      }
    }

    return this.mockFacilities(input);
  }

  private mockFacilities(input: PublicFacilityInput) {
    return {
      summary: `${input.region} 공공시설 검색 결과입니다.`,
      facilities: [
        {
          name: '오산시청',
          category: '공공기관',
          address: '경기도 오산시 성호대로 141'
        },
        {
          name: '오산시 중앙도서관',
          category: '도서관',
          address: '경기도 오산시 운암로 85'
        }
      ].filter((facility) => !input.keyword || facility.name.includes(input.keyword)),
      source: 'mock'
    };
  }
}

type KakaoKeywordResponse = {
  documents?: Array<{
    place_name: string;
    category_group_name?: string;
    category_name?: string;
    road_address_name?: string;
    address_name: string;
    place_url?: string;
    x: string;
    y: string;
  }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
