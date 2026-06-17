type BrandLogoProps = {
  size?: "default" | "large";
};

export function BrandLogo({ size = "default" }: BrandLogoProps) {
  return (
    <span className={`brand-logo ${size === "large" ? "brand-logo-large" : ""}`}>
      <img className="brand-logo-image" src="/brand/jungle-bob-logo.png?v=2" alt="정글밥" />
    </span>
  );
}
