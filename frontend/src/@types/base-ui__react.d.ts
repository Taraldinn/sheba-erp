declare module '@base-ui/react/merge-props';

declare module '@base-ui/react/use-render' {
  import * as React from 'react';
  export function useRender(params: any): any;
  export type ComponentProps<T extends keyof JSX.IntrinsicElements> = React.ComponentPropsWithoutRef<T>;
}
