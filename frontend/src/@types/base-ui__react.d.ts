declare module '@base-ui/react/merge-props' {
  export function mergeProps<T extends keyof JSX.IntrinsicElements>(...args: any[]): any;
}

declare module '@base-ui/react/use-render' {
  import type { ComponentPropsWithoutRef } from 'react';
  export function useRender(params: any): any;
  export namespace useRender {
    export type ComponentProps<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;
  }
}
