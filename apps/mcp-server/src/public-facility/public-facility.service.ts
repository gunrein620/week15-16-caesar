import { Injectable } from '@nestjs/common';

export type PublicFacilityInput = {
  region: string;
  keyword?: string;
};

@Injectable()
export class PublicFacilityService {
  async searchPublicFacility(input: PublicFacilityInput) {
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
      source: process.env.PUBLIC_DATA_API_KEY ? 'public-data-placeholder' : 'mock'
    };
  }
}
