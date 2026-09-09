import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import React from 'react';
import { Mermaid } from './mermaid';

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node.props?.children) {
    return extractText(node.props.children);
  }
  return '';
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Mermaid,
    pre: (props: any) => {
      const text = extractText(props.children).trim();
      const isMermaid =
        props['data-language'] === 'mermaid' ||
        text.startsWith('graph ') ||
        text.startsWith('flowchart ') ||
        text.startsWith('sequenceDiagram') ||
        text.startsWith('stateDiagram') ||
        text.startsWith('erDiagram') ||
        text.startsWith('classDiagram');

      if (isMermaid) {
        return <Mermaid chart={text} />;
      }

      return defaultMdxComponents.pre ? (
        defaultMdxComponents.pre(props)
      ) : (
        <pre {...props} />
      );
    },
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
