'use strict';

import { AstPath, doc, Doc } from 'prettier';
import {
  shouldPreserveContent,
  countParents,
  forceBreakContent,
  hasNoCloseMarker,
} from '~/printer/utils';
import {
  printOpeningTagPrefix,
  printOpeningTag,
  printClosingTagSuffix,
  printClosingTag,
  needsToBorrowPrevClosingTagEndMarker,
  needsToBorrowLastChildClosingTagEndMarker,
  getNodeContent,
} from '~/printer/print/tag';
import { printChildren } from '~/printer/print/children';
import {
  NodeTypes,
  LiquidParserOptions,
  LiquidPrinter,
  LiquidHtmlNode,
  HtmlNode,
} from '~/types';

const {
  builders: { breakParent, dedentToRoot, group, indent, line, softline },
} = doc;
const { replaceTextEndOfLine } = doc.utils as any;

export function printElement(
  path: AstPath<HtmlNode>,
  options: LiquidParserOptions,
  print: LiquidPrinter,
) {
  const node = path.getValue();

  if (hasNoCloseMarker(node)) {
    return [
      group(printOpeningTag(path, options, print)),
      ...printClosingTag(node, options),
      printClosingTagSuffix(node, options),
    ];
  }

  if (
    shouldPreserveContent(node, options) ||
    node.type === NodeTypes.HtmlRawNode
  ) {
    return [
      printOpeningTagPrefix(node, options),
      group(printOpeningTag(path, options, print)),
      ...replaceTextEndOfLine(getNodeContent(node, options)),
      ...printClosingTag(node, options),
      printClosingTagSuffix(node, options),
    ];
  }

  const attrGroupId = Symbol('element-attr-group-id');
  const elementGroupId = Symbol('element-group-id');

  const printTag = (doc: Doc) =>
    group(
      [
        group(printOpeningTag(path, options, print), { id: attrGroupId }),
        doc,
        printClosingTag(node, options),
      ],
      { id: elementGroupId },
    );

  const printChildrenDoc = (childrenDoc: Doc) => {
    // if (
    //   (isScriptLikeTag(node) || isVueCustomBlock(node, options)) &&
    //   node.parentNode.type === NodeTypes.Document &&
    //   options.parser === 'vue' &&
    //   !options.vueIndentScriptAndStyle
    // ) {
    //   return childrenDoc;
    // }
    return indent(childrenDoc);
  };

  const printLineBeforeChildren = () => {
    if (
      node.firstChild!.hasLeadingWhitespace &&
      node.firstChild!.isLeadingWhitespaceSensitive
    ) {
      return line;
    }

    if (
      node.firstChild!.type === NodeTypes.TextNode &&
      node.isWhitespaceSensitive &&
      node.isIndentationSensitive
    ) {
      return dedentToRoot(softline);
    }
    return softline;
  };

  const printLineAfterChildren = () => {
    const needsToBorrow = node.next
      ? needsToBorrowPrevClosingTagEndMarker(node.next)
      : needsToBorrowLastChildClosingTagEndMarker(node.parentNode!);
    if (needsToBorrow) {
      if (
        node.lastChild!.hasTrailingWhitespace &&
        node.lastChild!.isTrailingWhitespaceSensitive
      ) {
        return ' ';
      }
      return '';
    }
    if (
      node.lastChild!.hasTrailingWhitespace &&
      node.lastChild!.isTrailingWhitespaceSensitive
    ) {
      return line;
    }
    const lastChild = node.lastChild!;
    if (
      (lastChild!.type === NodeTypes.HtmlComment &&
        endsInProperlyIndentedEmptyLine(path, lastChild.body, options)) ||
      (lastChild!.type === NodeTypes.TextNode &&
        node.isWhitespaceSensitive &&
        node.isIndentationSensitive &&
        endsInProperlyIndentedEmptyLine(path, lastChild.value, options))
    ) {
      return '';
    }
    return softline;
  };

  if (node.children.length === 0) {
    return printTag(
      node.hasDanglingWhitespace && node.isDanglingWhitespaceSensitive
        ? line
        : '',
    );
  }

  return printTag([
    forceBreakContent(node) ? breakParent : '',
    printChildrenDoc([
      printLineBeforeChildren(),
      printChildren(path as AstPath<typeof node>, options, print, {
        leadingSpaceGroupId: elementGroupId,
        trailingSpaceGroupId: elementGroupId,
      }),
    ]),
    printLineAfterChildren(),
  ]);
}

// TODO: Not sure the name is correct, this is code we got from prettier and I'm
// not 100% sure why we need it.
function endsInProperlyIndentedEmptyLine(
  path: AstPath<any>,
  value: string,
  options: LiquidParserOptions,
) {
  return new RegExp(
    `\\n[\\t ]{${
      options.tabWidth *
      countParents(
        path,
        (node: LiquidHtmlNode) =>
          !!node.parentNode && node.parentNode.type !== NodeTypes.Document,
      )
    }}$`,
  ).test(value);
}
