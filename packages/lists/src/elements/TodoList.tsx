import { PluginElementRenderProps } from '@yoopta/editor';
import { TodoListElementProps } from '../types';

const TodoListRender = ({ attributes, element, children }: PluginElementRenderProps) => {
  const { checked = false } = (element.props || {}) as TodoListElementProps;

  return (
    <div className="flex items-center pl-4 space-x-2 py-[3px]" data-element-type="TodoListItem" {...attributes}>
      <input type="checkbox" className="form-checkbox min-w-[10px] w-auto" checked={checked} />
      <div className="flex-grow">{children}</div>
    </div>
  );
};

export { TodoListRender };
