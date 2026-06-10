import { ExternalLink, MapPin, Navigation, ParkingCircle, Pill, ShoppingBasket } from 'lucide-react';

const mapPlaces = [
  {
    name: '오산역',
    category: '교통',
    address: '경기 오산시 역광장로',
    detail: '환승, 버스, 택시 승강장',
    href: 'https://map.kakao.com/link/search/%EC%98%A4%EC%82%B0%EC%97%AD',
    icon: <Navigation size={16} />,
    position: 'pin-station'
  },
  {
    name: '오산역 환승공영주차장',
    category: '주차',
    address: '경기 오산시 오산동 621-3',
    detail: '오산역 도보권 공영주차장',
    href: 'https://map.kakao.com/link/search/%EC%98%A4%EC%82%B0%EC%97%AD%20%ED%99%98%EC%8A%B9%EA%B3%B5%EC%98%81%EC%A3%BC%EC%B0%A8%EC%9E%A5',
    icon: <ParkingCircle size={16} />,
    position: 'pin-parking'
  },
  {
    name: '보광온누리약국',
    category: '약국',
    address: '경기 오산시 오산로 209',
    detail: '오산역 인근 약국',
    href: 'http://place.map.kakao.com/8366241',
    icon: <Pill size={16} />,
    position: 'pin-pharmacy'
  },
  {
    name: '오색시장',
    category: '시장',
    address: '경기 오산시 오산로272번길',
    detail: '장보기, 먹거리, 생활 상권',
    href: 'https://map.kakao.com/link/search/%EC%98%A4%EC%82%B0%20%EC%98%A4%EC%83%89%EC%8B%9C%EC%9E%A5',
    icon: <ShoppingBasket size={16} />,
    position: 'pin-market'
  }
];

export function NeighborhoodMapPage() {
  return (
    <section className="map-page" aria-label="동네지도">
      <div className="page-heading">
        <MapPin size={24} />
        <div>
          <h1>오산 동네지도</h1>
          <p>오산역 생활권 주요 장소</p>
        </div>
      </div>

      <div className="map-visual" aria-label="오산 생활권 지도">
        <div className="map-road horizontal" />
        <div className="map-road vertical" />
        <span className="map-area area-north">오산동</span>
        <span className="map-area area-east">원동</span>
        <span className="map-area area-south">대원동</span>
        {mapPlaces.map((place) => (
          <a className={`map-pin ${place.position}`} href={place.href} target="_blank" rel="noreferrer" key={place.name}>
            {place.icon}
            <span>{place.name}</span>
          </a>
        ))}
      </div>

      <div className="place-list" aria-label="주요 장소 목록">
        {mapPlaces.map((place) => (
          <article className="place-row" key={place.name}>
            <div className="place-row-icon">{place.icon}</div>
            <div>
              <strong>{place.name}</strong>
              <p>{place.address}</p>
              <span>{place.category} · {place.detail}</span>
            </div>
            <a href={place.href} target="_blank" rel="noreferrer" aria-label={`${place.name} 지도 열기`}>
              <ExternalLink size={16} />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
