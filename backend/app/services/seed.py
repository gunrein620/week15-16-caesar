from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password, utc_now
from app.models import Artist, ArtistArchiveTerm, ArtistKeyword, Member, Post, Tag, User
from app.services.rag import refresh_post_chunks


RESCENE_ARCHIVE_TERMS: tuple[tuple[str, str, list[str]], ...] = (
    (
        "song",
        "YoYo",
        [
            "YoYo",
            "YOYO",
            "Yoyo",
            "Yo Yo",
            "요요",
            "요 요",
            "YoYo (Japanese ver.)",
            "YoYo Japanese ver.",
            "요요 일본어",
            "ヨヨ",
        ],
    ),
    (
        "song",
        "UhUh",
        [
            "UhUh",
            "UH UH",
            "Uh Uh",
            "Uh-Uh",
            "Uhuh",
            "UHUH",
            "어어",
            "UhUh (Japanese ver.)",
            "UhUh Japanese ver.",
            "ウーアー",
        ],
    ),
    (
        "song",
        "Counting Star",
        [
            "Counting Star",
            "CountingStar",
            "카운팅스타",
            "카운팅 스타",
            "THE MAGIC STAR",
            "The Magic Star",
            "매직스타",
        ],
    ),
    ("song", "Lucky You", ["Lucky You", "LuckyYou", "럭키유", "럭키 유"]),
    (
        "song",
        "Love Attack",
        [
            "Love Attack",
            "LOVE ATTACK",
            "LoveAttack",
            "loveattack",
            "러브어택",
            "러브 어택",
            "러브어택챌린지",
        ],
    ),
    ("song", "New World", ["New World", "NewWorld", "뉴월드", "뉴 월드"]),
    (
        "song",
        "Pinball",
        [
            "Pinball",
            "핀볼",
            "ピンボール",
            "Pinball (Japanese ver.)",
            "Pinball Japanese ver.",
            "ピンボール (Pinball)",
            "핀볼 일본어",
            "Pinball JP",
        ],
    ),
    ("song", "CRASH", ["CRASH", "Crash", "크래시", "크래쉬"]),
    (
        "song",
        "Glow Up",
        [
            "Glow Up",
            "GlowUp",
            "GLOW UP",
            "글로우업",
            "글로우 업",
            "글로업",
            "Glow Up (English ver.)",
            "Glow Up English ver.",
        ],
    ),
    ("song", "Going on", ["Going on", "Going On", "GoingOn", "고잉온", "고잉 온"]),
    (
        "song",
        "In my lotion",
        ["In my lotion", "In My Lotion", "inmylotion", "인마이로션", "인 마이 로션", "로션"],
    ),
    ("song", "Cotton Candy", ["Cotton Candy", "CottonCandy", "코튼캔디", "코튼 캔디", "솜사탕"]),
    (
        "song",
        "BamBamBam",
        [
            "BamBamBam",
            "Bam Bam Bam",
            "밤밤밤",
            "밤 밤 밤",
            "The First Night With The Duke",
            "공작님 첫날밤",
            "남주의 첫날밤",
        ],
    ),
    (
        "song",
        "Deja Vu",
        [
            "Deja Vu",
            "Déjà vu",
            "DejaVu",
            "Deja-Vu",
            "데자부",
            "데자뷰",
            "데자 뷰",
            "데자 부",
            "Deja Vu (Sped Up ver.)",
        ],
    ),
    ("song", "Mood", ["Mood", "무드", "Mood (Sped Up ver.)", "Mood Sped Up ver.", "무드 스페드업"]),
    (
        "song",
        "Love Frequency",
        [
            "Love Frequency",
            "LoveFrequency",
            "러브프리퀀시",
            "러브 프리퀀시",
            "Just For Meeting You",
            "저스트 포 미팅 유",
        ],
    ),
    ("song", "Heart Drop", ["Heart Drop", "HeartDrop", "하트드롭", "하트 드롭"]),
    ("song", "Bloom", ["Bloom", "블룸", "bloom"]),
    ("song", "Love Echo", ["Love Echo", "LoveEcho", "러브에코", "러브 에코"]),
    ("song", "Hello XO", ["Hello XO", "HelloXO", "헬로XO", "헬로 엑스오", "헬로 엑스오"]),
    ("song", "MVP", ["MVP", "엠브이피", "엠비피", "엠 브이 피"]),
    (
        "song",
        "Higher",
        ["Higher", "하이어", "Music from THE SPECIALS", "THE SPECIALS", "더 스페셜스"],
    ),
    (
        "song",
        "Busy Boy",
        [
            "Busy Boy",
            "BusyBoy",
            "비지보이",
            "비지 보이",
            "Busy Boy (Inst.)",
            "Busy Boy Inst.",
            "RESCENE X ???",
        ],
    ),
    (
        "song",
        "Busy Boy (Galantis Remix)",
        [
            "Busy Boy (Galantis Remix)",
            "Busy Boy Galantis Remix",
            "Busy Boy remix",
            "Busy Boy 리믹스",
            "Galantis Remix",
            "갈란티스 리믹스",
        ],
    ),
    (
        "song",
        "Runaway",
        ["Runaway", "Run Away", "런어웨이", "런 어웨이", "I run away", "runaway challenge"],
    ),
    (
        "album",
        "Re:Scene",
        ["Re:Scene", "Re Scene", "ReScene", "리씬", "리신", "데뷔 싱글", "1st Single Album"],
    ),
    (
        "album",
        "SCENEDROME",
        [
            "SCENEDROME",
            "SceneDrome",
            "씬드롬",
            "신드롬",
            "1st Mini Album",
            "첫 미니",
            "Love Attack album",
            "Pinball album",
        ],
    ),
    (
        "album",
        "Glow Up",
        [
            "Glow Up",
            "GlowUp",
            "글로우업",
            "글로우 업",
            "2nd Mini Album",
            "두 번째 미니",
            "위 버전",
            "유 버전",
        ],
    ),
    (
        "album",
        "Dearest",
        ["Dearest", "디어리스트", "디얼리스트", "2nd Single Album", "두 번째 싱글", "Dear", "Dewy"],
    ),
    (
        "album",
        "lip bomb",
        ["lip bomb", "Lip Bomb", "LIP BOMB", "립밤", "립 밤", "3rd Mini Album", "세 번째 미니"],
    ),
    (
        "album",
        "Music from THE SPECIALS",
        ["Music from THE SPECIALS", "THE SPECIALS", "더 스페셜스", "Higher OST", "하이어 OST"],
    ),
    (
        "album",
        "[RESCENE X ???]",
        [
            "[RESCENE X ???]",
            "RESCENE X ???",
            "RESCENE X",
            "Busy Boy single",
            "Busy Boy collaboration",
            "비지보이 콜라보",
        ],
    ),
    (
        "album",
        "Runaway",
        ["Runaway", "Runaway - Single", "1st Digital Single", "첫 디지털 싱글", "런어웨이 싱글"],
    ),
    (
        "activity",
        "Pre-debut YoYo",
        [
            "프리데뷔",
            "프리 데뷔",
            "선공개",
            "선공개곡",
            "YoYo 선공개",
            "요요 선공개",
            "pre-debut",
            "pre release",
            "pre-release",
        ],
    ),
    (
        "activity",
        "Re:Scene debut",
        [
            "데뷔",
            "데뷔 활동",
            "UhUh 활동",
            "어어 활동",
            "Re:Scene 활동",
            "리센느 데뷔",
            "debut showcase",
        ],
    ),
    (
        "activity",
        "SCENEDROME era",
        [
            "SCENEDROME 활동",
            "Love Attack 활동",
            "러브어택 활동",
            "Pinball 활동",
            "핀볼 활동",
            "2024 컴백",
            "컴백 0827",
        ],
    ),
    (
        "activity",
        "Glow Up era",
        [
            "Glow Up 활동",
            "글로우업 활동",
            "2nd Mini 활동",
            "2025 컴백",
            "Glow Up comeback",
            "글로업 활동",
        ],
    ),
    (
        "activity",
        "Dearest era",
        [
            "Dearest 활동",
            "Deja Vu 활동",
            "데자부 활동",
            "데자뷰 활동",
            "2nd Single 활동",
            "디어리스트 활동",
        ],
    ),
    (
        "activity",
        "lip bomb era",
        [
            "lip bomb 활동",
            "립밤 활동",
            "Heart Drop 활동",
            "하트드롭 활동",
            "Bloom 활동",
            "블룸 활동",
            "3rd Mini 활동",
        ],
    ),
    (
        "activity",
        "Runaway era",
        [
            "Runaway 활동",
            "런어웨이 활동",
            "1st Digital Single 활동",
            "첫 디지털 싱글 활동",
            "2026 컴백",
            "Runaway comeback",
        ],
    ),
    (
        "activity",
        "OST and collaboration releases",
        [
            "OST",
            "오에스티",
            "일본어 버전",
            "Japanese ver.",
            "collaboration",
            "콜라보",
            "remix",
            "리믹스",
            "스페드업",
            "sped up",
        ],
    ),
    (
        "member",
        "Woni",
        [
            "Woni",
            "WONI",
            "원이",
            "ウォニ",
            "Jeong Woni",
            "Jeong Won-i",
            "Jung Woni",
            "정원이",
            "RESCENE WONI",
            "rescenewoni",
            "리센느원이",
            "helloiamwoninicetomeetyou",
            "원이입니다",
            "인간 파이리상",
            "파이리상",
        ],
    ),
    (
        "member",
        "Liv",
        [
            "Liv",
            "LIV",
            "리브",
            "リブ",
            "Jin Kyung-eun",
            "Jin Kyungeun",
            "진경은",
            "RESCENE LIV",
            "resceneliv",
            "리센느리브",
            "Voice Fairy",
            "보이스 페어리",
            "보이스페어리",
            "음색요정",
            "Just Liv",
            "그냥리브",
        ],
    ),
    (
        "member",
        "Minami",
        [
            "Minami",
            "MINAMI",
            "미나미",
            "ミナミ",
            "Ito Minami",
            "Itō Minami",
            "이토 미나미",
            "伊藤 南美",
            "RESCENE MINAMI",
            "resceneminami",
            "리센느미나미",
            "나미",
            "미나미나",
            "My Teenage Girl",
            "방과후 설렘",
        ],
    ),
    (
        "member",
        "May",
        [
            "May",
            "MAY",
            "메이",
            "メイ",
            "Lee Ye-bin",
            "Lee Yebin",
            "이예빈",
            "RESCENE MAY",
            "rescenemay",
            "리센느메이",
            "꼬맹이",
            "Kkomaeng-ie",
            "sunshine",
            "햇살",
            "메이메이",
        ],
    ),
    (
        "member",
        "Zena",
        [
            "Zena",
            "ZENA",
            "제나",
            "ゼナ",
            "Kim Ga-young",
            "Kim Gayoung",
            "김가영",
            "RESCENE ZENA",
            "rescenezena",
            "리센느제나",
            "신라공주",
            "신라 공주",
            "경주공주",
            "경주 공주",
            "MAVE",
            "MAVE:",
            "마브",
            "마베",
        ],
    ),
)


def _merge_aliases(existing: list[str], aliases: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for alias in [*existing, *aliases]:
        value = alias.strip()
        if value:
            seen.setdefault(value, None)
    return list(seen)


def _sync_archive_term_pk_sequence(db: Session) -> None:
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return
    db.execute(
        text(
            """
            SELECT setval(
                pg_get_serial_sequence('artist_archive_terms', 'id'),
                COALESCE((SELECT MAX(id) FROM artist_archive_terms), 1),
                (SELECT COUNT(*) > 0 FROM artist_archive_terms)
            )
            """
        )
    )


def ensure_rescene_seed(db: Session) -> Artist:
    artist = db.scalar(select(Artist).where(Artist.slug == "rescene"))
    if artist is None:
        artist = Artist(
            slug="rescene",
            name="RESCENE",
            description="RESCENE fan community seed artist.",
        )
        db.add(artist)
        db.flush()

    existing_members = {member.name for member in artist.members}
    for name in ["Woni", "Liv", "Minami", "May", "Zena"]:
        if name not in existing_members:
            db.add(Member(artist_id=artist.id, name=name))

    existing_keywords = {keyword.keyword for keyword in artist.keywords}
    for keyword in ["RESCENE", "리센느", "REMINE", "리마인", "Love Attack", "UhUh"]:
        if keyword not in existing_keywords:
            db.add(ArtistKeyword(artist_id=artist.id, keyword=keyword))

    existing_archive_terms = {(term.term_type, term.title): term for term in artist.archive_terms}
    _sync_archive_term_pk_sequence(db)
    for term_type, title, aliases in RESCENE_ARCHIVE_TERMS:
        existing = existing_archive_terms.get((term_type, title))
        if existing is not None:
            existing.aliases = _merge_aliases(existing.aliases or [], aliases)
        else:
            db.add(
                ArtistArchiveTerm(
                    artist_id=artist.id,
                    term_type=term_type,
                    title=title,
                    aliases=aliases,
                )
            )

    db.flush()
    return artist


def ensure_admin_user(db: Session) -> User:
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == settings.seed_admin_email))
    if user is None:
        user = User(
            email=settings.seed_admin_email,
            display_name="Admin",
            hashed_password=hash_password(settings.seed_admin_password),
            role="admin",
            email_verified_at=utc_now(),
        )
        db.add(user)
        db.flush()
    else:
        user.role = "admin"
        user.hashed_password = hash_password(settings.seed_admin_password)
        if user.email_verified_at is None:
            user.email_verified_at = utc_now()
    return user


def ensure_minimal_rag_seed(db: Session) -> None:
    artist = ensure_rescene_seed(db)
    admin = ensure_admin_user(db)
    titles = {
        "리센느 입덕 포인트": "리센느는 청량한 무대와 선명한 콘셉트가 강점인 그룹입니다.",
        "Love Attack 무대 이야기": "Love Attack 활동에서는 멤버들의 보컬 색과 퍼포먼스 합이 돋보였습니다.",
        "팬 커뮤니티 이용 안내": "이 게시판은 리센느 소식과 팬 반응을 모아 RAG 답변의 근거로 사용합니다.",
    }
    for title, content in titles.items():
        post = db.scalar(select(Post).where(Post.title == title))
        if post is None:
            post = Post(title=title, content=content, author_id=admin.id, artist_id=artist.id)
            db.add(post)
            db.flush()
        if not post.rag_chunks:
            refresh_post_chunks(db, post)
    for tag_name in ["rescene", "stage", "notice"]:
        if db.scalar(select(Tag).where(Tag.name == tag_name)) is None:
            db.add(Tag(name=tag_name))
    db.commit()
