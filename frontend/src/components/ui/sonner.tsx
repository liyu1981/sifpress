import { useTheme } from "@/lib/theme"
import { Toaster as Sonner, type ToasterProps } from "sonner"

function Toaster(props: ToasterProps) {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
