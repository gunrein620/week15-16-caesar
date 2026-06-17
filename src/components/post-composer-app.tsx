"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Bell,
  BellRing,
  CalendarDays,
  ImagePlus,
  Loader2,
  LogIn,
  ReceiptText,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  showBrowserNotification,
  type BrowserNotificationPermission,
} from "@/lib/browser-notifications";
import type { OAuthProviderId } from "@/lib/oauth-provider-status";
import type { FeedMealMenu, RecentMealResponse } from "@/types/meal";
import type { FeedPost, InitialSession } from "@/types/post";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImages = 5;

const notificationLabels: Record<BrowserNotificationPermission, string> = {
  default: "알림 꺼짐",
  denied: "알림 차단됨",
  granted: "알림 켜짐",
  unsupported: "알림 미지원",
};

const loginProviders = [
  {
    id: "naver" as const,
    label: "네이버",
    className: "border-[#03c75a] bg-[#03c75a] text-white hover:bg-[#02b351]",
  },
  {
    id: "kakao" as const,
    label: "카카오",
    className: "border-[#f6d84f] bg-[#fee84d] text-[#371d1e] hover:bg-[#f7df47]",
  },
  {
    id: "google" as const,
    label: "구글",
    className: "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
  },
];

type DraftImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type ProviderStatusResponse = {
  providers?: Array<{
    id: OAuthProviderId;
    configured: boolean;
  }>;
};

type PostComposerAppProps = {
  initialSession: InitialSession;
};

function MealSummaryCard({
  meal,
  onRemove,
}: {
  meal: FeedMealMenu;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#ccf5e9] bg-[#e6faf4] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-[var(--jungle-green)]">
            식단 증거
          </p>
          <p className="mt-1 font-black text-[var(--jungle-deep)]">
            {meal.mealDate} {meal.mealType === "LUNCH" ? "중식" : "석식"}
          </p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
            {meal.menuText || "메뉴 텍스트가 아직 공개되지 않았습니다."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-200 transition hover:text-[#ad315c]"
          aria-label="첨부 식단 제거"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

export default function PostComposerApp({ initialSession }: PostComposerAppProps) {
  const router = useRouter();
  const signedIn = Boolean(initialSession?.user?.id);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>("unsupported");
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const draftImagesRef = useRef<DraftImage[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<FeedMealMenu | null>(null);
  const [loadingMeal, setLoadingMeal] = useState(false);
  const [mealMessage, setMealMessage] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [providerStatusById, setProviderStatusById] =
    useState<Record<OAuthProviderId, boolean> | null>(null);
  const [form, setForm] = useState({
    snackName: "",
    reason: "",
    ateLunch: false,
    ateDinner: false,
    tags: "",
  });

  const notificationSupported = notificationPermission !== "unsupported";
  const remainingImages = useMemo(() => maxImages - draftImages.length, [draftImages.length]);
  const canSubmit =
    signedIn && form.snackName.trim().length > 0 && form.reason.trim().length > 0 && !submitting;

  useEffect(() => {
    draftImagesRef.current = draftImages;
  }, [draftImages]);

  useEffect(() => {
    let active = true;
    let permissionStatus: PermissionStatus | undefined;

    async function syncNotificationState() {
      if (!isNotificationSupported()) {
        return;
      }

      if (active) {
        setNotificationPermission(getNotificationPermission());
      }

      if (typeof navigator === "undefined" || !("permissions" in navigator)) {
        return;
      }

      try {
        permissionStatus = await navigator.permissions.query({
          name: "notifications" as PermissionName,
        });

        if (!active) {
          return;
        }

        setNotificationPermission(getNotificationPermission());
        permissionStatus.onchange = () => {
          setNotificationPermission(getNotificationPermission());
        };
      } catch {
        // Some browsers expose Notification but not the permissions entry.
      }
    }

    syncNotificationState();

    return () => {
      active = false;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const image of draftImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!loginModalOpen || providerStatusById) {
      return;
    }

    let active = true;

    async function loadProviderStatus() {
      try {
        const response = await fetch("/api/auth/provider-status", { cache: "no-store" });
        const data = (await response.json()) as ProviderStatusResponse;
        const nextStatus = Object.fromEntries(
          loginProviders.map((provider) => [
            provider.id,
            Boolean(data.providers?.find((item) => item.id === provider.id)?.configured),
          ]),
        ) as Record<OAuthProviderId, boolean>;

        if (active) {
          setProviderStatusById(nextStatus);
        }
      } catch {
        if (active) {
          setProviderStatusById({ naver: false, kakao: false, google: false });
        }
      }
    }

    loadProviderStatus();

    return () => {
      active = false;
    };
  }, [loginModalOpen, providerStatusById]);

  function updateField(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function enableNotifications() {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setMessage("알림이 켜졌습니다.");
    } else if (permission === "denied") {
      setMessage("브라우저 설정에서 알림 권한을 다시 허용해야 합니다.");
    }
  }

  function sendTestNotification() {
    const shown = showBrowserNotification("정글 간식 재판소", {
      body: "브라우저 알림이 정상적으로 켜졌습니다.",
    });

    if (shown) {
      setMessage("테스트 알림을 보냈습니다.");
    }
  }

  async function loadRecentMeal() {
    setLoadingMeal(true);
    setMealMessage(null);

    try {
      const response = await fetch("/api/meals/recent", { cache: "no-store" });
      const data = (await response.json()) as RecentMealResponse;

      if (!response.ok) {
        throw new Error(data.message || "식단을 불러오지 못했습니다.");
      }

      setSelectedMeal(data.meal);
      setMealMessage(
        data.meal ? data.message : data.message || "아직 공개된 식단 메뉴가 없습니다.",
      );
    } catch (error) {
      setSelectedMeal(null);
      setMealMessage(error instanceof Error ? error.message : "식단을 불러오지 못했습니다.");
    } finally {
      setLoadingMeal(false);
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    setMessage(null);

    if (!selectedFiles.length) {
      return;
    }

    const invalidFile = selectedFiles.find((file) => !allowedImageTypes.has(file.type));
    if (invalidFile) {
      setMessage("jpg, png, webp 이미지만 첨부할 수 있습니다.");
      return;
    }

    if (selectedFiles.length > remainingImages) {
      setMessage("이미지는 최대 5장까지 첨부할 수 있습니다.");
    }

    const nextImages = selectedFiles.slice(0, Math.max(remainingImages, 0)).map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setDraftImages((current) => [...current, ...nextImages]);
  }

  function removeDraftImage(id: string) {
    setDraftImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter((image) => image.id !== id);
    });
  }

  function resetComposer() {
    for (const image of draftImages) {
      URL.revokeObjectURL(image.previewUrl);
    }

    setDraftImages([]);
    setSelectedMeal(null);
    setForm({
      snackName: "",
      reason: "",
      ateLunch: false,
      ateDinner: false,
      tags: "",
    });
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("snackName", form.snackName);
    formData.append("reason", form.reason);
    formData.append("ateLunch", String(form.ateLunch));
    formData.append("ateDinner", String(form.ateDinner));
    formData.append("tags", form.tags);

    if (selectedMeal) {
      formData.append("mealMenuId", selectedMeal.id);
    }

    for (const image of draftImages) {
      formData.append("images", image.file);
    }

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { post?: FeedPost; message?: string };

      if (!response.ok || !data.post) {
        throw new Error(data.message || "포스트 작성에 실패했습니다.");
      }

      showBrowserNotification("간식 재판이 접수되었습니다", {
        body: `${data.post.snackName} 사건이 피드에 올라갔습니다.`,
      });
      resetComposer();
      router.push(`/posts/${data.post.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "포스트 작성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--jungle-bg)] text-zinc-950">
      {loginModalOpen && !signedIn ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 px-4 py-5 backdrop-blur-sm sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setLoginModalOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--jungle-green)]">
                  Social Login
                </p>
                <h2 id="login-modal-title" className="mt-1 text-xl font-black">
                  로그인 선택
                </h2>
                <p className="mt-1 text-sm font-semibold text-zinc-500">
                  사용할 계정으로 간식 재판소에 입장하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100"
                aria-label="로그인 모달 닫기"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              {loginProviders.map((provider) => {
                const statusLoaded = providerStatusById !== null;
                const configured = Boolean(providerStatusById?.[provider.id]);

                return (
                  <button
                    type="button"
                    key={provider.id}
                    disabled={!configured}
                    onClick={() => {
                      if (!configured) {
                        return;
                      }

                      setLoginModalOpen(false);
                      signIn(provider.id, { callbackUrl: "/posts/new" });
                    }}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 ${configured ? provider.className : ""}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <LogIn size={17} />
                      {provider.label} 로그인
                    </span>
                    {!configured ? (
                      <span className="text-xs font-bold">
                        {statusLoaded ? "환경변수 필요" : "확인 중"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 lg:py-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <img
              src="/brand/snack-court-icon.png"
              alt="정글 간식 재판소"
              className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12"
            />
            <h1 className="text-2xl font-black tracking-normal text-[var(--jungle-deep)] sm:text-3xl">
              간식 사건 접수
            </h1>
          </div>

          <Link
            href="/"
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-white px-3 text-sm font-black text-[var(--jungle-deep)] ring-1 ring-zinc-200 transition hover:bg-[#e6faf4]"
          >
            <ArrowLeft size={16} />
            피드로 돌아가기
          </Link>
        </header>

        {!signedIn ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-lg font-black">로그인이 필요합니다.</p>
            <p className="mt-1 text-sm font-semibold text-zinc-500">
              소셜 로그인 후 간식 사건을 접수할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--jungle-deep)] px-4 text-sm font-black text-white transition hover:bg-[#025334]"
            >
              <LogIn size={16} />
              로그인
            </button>
          </section>
        ) : (
          <form
            onSubmit={submitPost}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-[var(--jungle-green)]">
                  <ReceiptText size={15} />
                  빠른 접수
                </div>
                <h2 className="mt-1 text-xl font-black">간식 사유서</h2>
                <p className="text-sm text-zinc-500">먹었다면, 이유가 있다.</p>
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--jungle-deep)] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#025334] disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                제출
              </button>
            </div>

            {notificationSupported ? (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-[#f8f9fa] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid size-10 place-items-center rounded-lg ${
                        notificationPermission === "granted"
                          ? "bg-[#e6faf4] text-[var(--jungle-deep)]"
                          : "bg-[#fff7d7] text-[#7a5200]"
                      }`}
                    >
                      {notificationPermission === "granted" ? (
                        <BellRing size={18} />
                      ) : (
                        <Bell size={18} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-black">
                        {notificationLabels[notificationPermission]}
                      </p>
                      {notificationPermission === "denied" ? (
                        <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                          브라우저 설정에서 알림 권한을 다시 허용해야 합니다.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {notificationPermission === "default" ? (
                      <button
                        type="button"
                        onClick={enableNotifications}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--jungle-green)] bg-white px-3 text-sm font-bold text-[var(--jungle-deep)] transition hover:bg-[#e6faf4]"
                      >
                        <Bell size={16} />
                        알림 켜기
                      </button>
                    ) : null}
                    {notificationPermission === "granted" ? (
                      <button
                        type="button"
                        onClick={sendTestNotification}
                        className="inline-flex min-h-10 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100"
                      >
                        테스트 알림
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mb-3 rounded-lg border border-[#ccf5e9] bg-[#f7fcf8] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black">오늘 식단 맥락</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    공개된 최근 식단을 불러와 이 사건에 첨부합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadRecentMeal}
                  disabled={loadingMeal}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--jungle-green)] bg-white px-3 text-sm font-bold text-[var(--jungle-deep)] transition hover:bg-[#e6faf4] disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMeal ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CalendarDays size={16} />
                  )}
                  식단 불러오기
                </button>
              </div>

              {selectedMeal ? (
                <div className="mt-3">
                  <MealSummaryCard
                    meal={selectedMeal}
                    onRemove={() => {
                      setSelectedMeal(null);
                      setMealMessage("첨부한 식단을 제거했습니다.");
                    }}
                  />
                </div>
              ) : null}

              {mealMessage ? (
                <p className="mt-3 text-xs font-semibold text-zinc-500">{mealMessage}</p>
              ) : null}
            </div>

            <fieldset disabled={submitting} className="space-y-3 disabled:opacity-60">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">간식 이름</span>
                <input
                  value={form.snackName}
                  onChange={(event) => updateField("snackName", event.target.value)}
                  placeholder="컵라면, 삼각김밥, 초코우유"
                  className="min-h-12 w-full rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[var(--jungle-mint)] focus:bg-white focus:ring-2 focus:ring-[#05d18233]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">먹은 이유 / 변명</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => updateField("reason", event.target.value)}
                  placeholder="DP 배열을 보다가 정신을 차려보니..."
                  rows={6}
                  className="min-h-36 w-full resize-none rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 py-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[var(--jungle-mint)] focus:bg-white focus:ring-2 focus:ring-[#05d18233]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 text-sm font-bold transition has-[:checked]:border-[var(--jungle-green)] has-[:checked]:bg-[#e6faf4]">
                  <input
                    type="checkbox"
                    checked={form.ateLunch}
                    onChange={(event) => updateField("ateLunch", event.target.checked)}
                    className="size-5 accent-[var(--jungle-green)]"
                  />
                  점심 먹음
                </label>
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 text-sm font-bold transition has-[:checked]:border-[var(--jungle-green)] has-[:checked]:bg-[#e6faf4]">
                  <input
                    type="checkbox"
                    checked={form.ateDinner}
                    onChange={(event) => updateField("ateDinner", event.target.checked)}
                    className="size-5 accent-[var(--jungle-green)]"
                  />
                  저녁 먹음
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">태그</span>
                <input
                  value={form.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  placeholder="알고리즘 야식 디버깅"
                  className="min-h-12 w-full rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[var(--jungle-mint)] focus:bg-white focus:ring-2 focus:ring-[#05d18233]"
                />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">이미지</span>
                  <span className="text-xs font-semibold text-zinc-500">
                    {draftImages.length}/{maxImages}
                  </span>
                </div>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--jungle-green)] bg-[#e6faf4] px-3 py-3 text-center text-sm font-bold text-[var(--jungle-deep)] transition hover:bg-[#ccf5e9]">
                  <ImagePlus size={22} />
                  <span>jpg, png, webp</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={remainingImages <= 0}
                  />
                </label>

                {draftImages.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {draftImages.map((image) => (
                      <div
                        key={image.id}
                        className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm"
                      >
                        <img
                          src={image.previewUrl}
                          alt="첨부 이미지 미리보기"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeDraftImage(image.id)}
                          className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-zinc-950/75 text-white transition hover:bg-zinc-950"
                          aria-label="이미지 삭제"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </fieldset>

            {message ? (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-[#f8f9fa] px-3 py-2 text-sm font-semibold text-zinc-700">
                {message}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
