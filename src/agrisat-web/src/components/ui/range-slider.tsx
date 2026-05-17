"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "#/lib/utils.ts"

interface DualRangeSliderProps
  extends React.ComponentProps<typeof SliderPrimitive.Root> {
  labelPosition?: "top" | "bottom"
  label?: (value: number | undefined) => React.ReactNode
}

function DualRangeSlider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  label,
  labelPosition = "top",
  ...props
}: DualRangeSliderProps) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="dual-range-slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="dual-range-slider-track"
        className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range
          data-slot="dual-range-slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      {_values.map((val, index) => (
        <SliderPrimitive.Thumb
          data-slot="dual-range-slider-thumb"
          key={index}
          className="relative block size-4 shrink-0 rounded-full border-2 border-primary bg-background ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
        >
          {label && (
            <span
              className={cn(
                "absolute flex w-full justify-center text-xs font-medium",
                labelPosition === "top" && "-top-7",
                labelPosition === "bottom" && "top-5"
              )}
            >
              {label(val)}
            </span>
          )}
        </SliderPrimitive.Thumb>
      ))}
    </SliderPrimitive.Root>
  )
}

export { DualRangeSlider }
