import Image from "next/image"

type Props = {
  variant?: "white" | "black" | "blue" | "primary" | "secondary"
  className?: string
  priority?: boolean
}

const srcMap: Record<NonNullable<Props["variant"]>, string> = {
  white: "/brand/jcrad-white.png",
  black: "/brand/jcrad-black.png",
  blue: "/brand/jcrad-blue.png",
  primary: "/brand/jcrad-primary.png",
  secondary: "/brand/jcrad-secondary.png",
}

export default function BrandLogo({
  variant = "white",
  className = "",
  priority = false,
}: Props) {
  return (
    <div className={className}>
      <Image
        src={srcMap[variant]}
        alt="JC RAD Inc"
        width={520}
        height={520}
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  )
}