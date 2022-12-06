import { Editor, Transforms, Range } from 'slate';
import { useCallback, KeyboardEvent, MouseEvent } from 'react';
import cx from 'classnames';
import Prism from 'prismjs';
import { Editable, ReactEditor } from 'slate-react';
import { v4 } from 'uuid';
import { TextLeaf } from './TextLeaf/TextLeaf';
import { RenderElement } from './RenderElement/RenderElement';
import { Toolbar } from './Toolbar/Toolbar';
import { capitalizeFirstLetter, LIST_TYPES, toggleBlock } from './utils';
import { ELEMENT_TYPES_MAP, TEXT_ELEMENTS_LIST, VOID_ELEMENTS } from './constants';
import { SuggestionElementList } from './SuggestionElementList/SuggestionElementList';
import { useScrollToElement } from '../../hooks/useScrollToElement';
import { useActionMenuContext, SUGGESTION_TRIGGER } from '../../contexts/ActionMenuContext/ActionMenuContext';
import { LibOptions, useSettings } from '../../contexts/SettingsContext/SettingsContext';
import { CustomElement, ParagraphElement } from './types';
import { useNodeSettingsContext } from '../../contexts/NodeSettingsContext/NodeSettingsContext';
import { OutsideClick } from '../OutsideClick';
import s from './Editor.module.scss';

type YoptaProps = { editor: Editor; placeholder: LibOptions['placeholder'] };

// TODO - move code decorator to code utils
const getLength = (token) => {
  if (typeof token === 'string') {
    return token.length;
  }
  if (typeof token.content === 'string') {
    return token.content.length;
  }
  return token.content.reduce((l, t) => l + getLength(t), 0);
};

const YoptaEditor = ({ editor, placeholder }: YoptaProps) => {
  const { options } = useSettings();
  useScrollToElement();
  const [{ disableWhileDrag }, { changeHoveredNode }] = useNodeSettingsContext();

  const {
    toolbarRef,
    toolbarStyle,
    selectedElement,
    hideToolbarTools,
    suggestionListRef,
    showSuggestionList,
    hideSuggestionList,
    filterSuggestionList,
    suggesstionListStyle,
    isSuggesstionListOpen,
    onChangeSuggestionFilterText,
    changeNodeType,
  } = useActionMenuContext();

  const isReadOnly = disableWhileDrag;

  const renderElement = useCallback((elemProps) => <RenderElement {...elemProps} />, []);
  const renderLeaf = useCallback((leafProps) => {
    const nodePlaceholder =
      leafProps.children.props?.parent.type === ELEMENT_TYPES_MAP.paragraph
        ? placeholder || ' Type / to open menu'
        : ` ${capitalizeFirstLetter(leafProps.children.props?.parent.type)}`;

    return <TextLeaf placeholder={nodePlaceholder} {...leafProps} />;
  }, []);

  const onKeyUp = useCallback(
    (event) => {
      if (!editor.selection) return;
      const text = Editor.string(editor, editor.selection.anchor.path);

      // [TODO] - make trigger not only empty paragraph
      if (!isSuggesstionListOpen && event.key === SUGGESTION_TRIGGER && text === SUGGESTION_TRIGGER) {
        showSuggestionList(undefined, { triggeredBySuggestion: true });
      }

      if (isSuggesstionListOpen) {
        onChangeSuggestionFilterText(text);
      }
    },
    [isSuggesstionListOpen],
  );

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const { selection } = editor;
    if (!selection) return;

    const currentNode: any = editor.children[editor.selection?.anchor.path[0] || 0];
    const text = Editor.string(editor, selection.anchor.path);
    const isEnter = event.key === 'Enter';

    if (event.key === 'Meta' || (event.key === 'Backspace' && (text.length === 0 || text === SUGGESTION_TRIGGER))) {
      hideSuggestionList();
    }

    if (isEnter) {
      const isListNode = LIST_TYPES.includes(currentNode.type);
      const isVoidNode = VOID_ELEMENTS.includes(currentNode.type);
      const isTextNode = TEXT_ELEMENTS_LIST.includes(currentNode.type);

      if (isListNode && text.trim() === '') {
        event.preventDefault();
        toggleBlock(editor, 'paragraph');
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        editor.insertText('\n');
      }

      const lineParagraph: ParagraphElement = {
        id: v4(),
        type: 'paragraph',
        children: [
          {
            text: '',
          },
        ],
      };

      if (!event.shiftKey && !isListNode) {
        // change next element to paragraph
        if (isTextNode) {
          event.preventDefault();
          Transforms.splitNodes(editor, { always: true });
          Transforms.setNodes(editor, lineParagraph);
          // add new line in case of void element (e.g. image)
        } else if (isVoidNode) {
          event.preventDefault();
          Transforms.insertNodes(editor, lineParagraph);
        }

        changeHoveredNode(lineParagraph);
      }
    }
  }, []);

  const decorate = ([node, path]) => {
    if (node.type === 'code') {
      const ranges = [];
      const tokens = Prism.tokenize(node.children[0].text, Prism.languages.javascript);
      let start = 0;

      // eslint-disable-next-line no-restricted-syntax
      for (const token of tokens) {
        const length = getLength(token);
        const end = start + length;

        if (typeof token !== 'string') {
          // @ts-ignore
          ranges.push({
            token: token.type,
            anchor: { path, offset: start },
            focus: { path, offset: end },
          });
        }

        start = end;
      }

      return ranges;
    }

    if (editor.selection) {
      if (
        !Editor.isEditor(node) &&
        Editor.string(editor, [path[0]]) === '' &&
        Range.includes(editor.selection, path) &&
        Range.isCollapsed(editor.selection)
      ) {
        return [
          {
            ...editor.selection,
            placeholder: true,
          },
        ];
      }
    }
    return [];
  };

  const handleEmptyZoneClick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (e.currentTarget !== e.target || !editor.selection) return;

    Editor.withoutNormalizing(editor, () => {
      const lastPath = [editor.children.length - 1, 0];
      const lastNode = editor.children[lastPath[0]] as CustomElement;
      const lastNodeText = Editor.string(editor, lastPath);

      const location = {
        anchor: { path: lastPath, offset: 0 },
        focus: { path: lastPath, offset: 0 },
      };

      const after = Editor.after(editor, location, {
        unit: 'block',
      });

      if (lastNode.type === ELEMENT_TYPES_MAP.paragraph && lastNodeText.length === 0) {
        Transforms.select(editor, {
          path: location.anchor.path,
          offset: 0,
        });

        changeHoveredNode(lastNode);
        return ReactEditor.focus(editor);
      }

      Transforms.select(editor, {
        path: after?.path || location.anchor.path,
        offset: after?.offset || 0,
      });

      const lineParagraph: ParagraphElement = {
        id: v4(),
        type: 'paragraph',
        children: [
          {
            text: '',
          },
        ],
      };

      changeHoveredNode(lineParagraph);
      Editor.insertNode(editor, lineParagraph);
      ReactEditor.focus(editor);
    });
  };

  const stopPropagation = (e: any) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  return (
    <main
      id="yopta-editor"
      aria-hidden
      className={cx(s.editorContainer, options.wrapCls)}
      onMouseDown={handleEmptyZoneClick}
    >
      <div className={cx(s.editorContent, options.contentCls)} aria-hidden onMouseDown={stopPropagation}>
        <OutsideClick onClose={hideToolbarTools}>
          {/* @ts-ignore */}
          <Toolbar toolbarRef={toolbarRef} toolbarStyle={toolbarStyle} editor={editor} />
        </OutsideClick>
        <SuggestionElementList
          filterListCallback={filterSuggestionList}
          style={suggesstionListStyle}
          onClose={hideSuggestionList}
          selectedElementType={selectedElement?.type}
          isOpen={isSuggesstionListOpen}
          changeNodeType={changeNodeType}
          ref={suggestionListRef}
        />
        <Editable
          renderLeaf={renderLeaf}
          renderElement={renderElement}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          readOnly={isReadOnly}
          spellCheck
          decorate={decorate}
          autoFocus
          id="yopta-contenteditable"
        />
      </div>
    </main>
  );
};

export { YoptaEditor };
