import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Card,
  Flex,
  Text,
  Badge,
  IconButton,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { DragIcon, DeleteIcon } from '@contentful/f36-icons';
import type { FieldWithMeta } from '../types';

interface DraggableFieldItemProps {
  field: FieldWithMeta;
  onRemove?: () => void;
  showRemove?: boolean;
}

export function DraggableFieldItem({
  field,
  onRemove,
  showRemove = false,
}: DraggableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      padding="none"
      {...attributes}
    >
      <Flex alignItems="center" justifyContent="space-between" gap="spacingS">
        <Flex alignItems="center" gap="spacingS">
          <div {...listeners} style={{ cursor: 'grab', color: tokens.gray500 }}>
            <DragIcon />
          </div>
          <Flex flexDirection="column" gap="spacing2Xs">
            <Text fontWeight="fontWeightMedium">{field.name}</Text>
            <Flex gap="spacingXs" alignItems="center">
              <Badge variant="secondary" size="small">
                {field.type}
              </Badge>
              {field.required && (
                <Badge variant="warning" size="small">
                  Required
                </Badge>
              )}
              {field.localized && (
                <Badge variant="primary" size="small">
                  Localized
                </Badge>
              )}
            </Flex>
          </Flex>
        </Flex>
        {showRemove && onRemove && (
          <IconButton
            variant="transparent"
            size="small"
            aria-label="Remove field from tab"
            icon={<DeleteIcon />}
            onClick={onRemove}
          />
        )}
      </Flex>
    </Card>
  );
}
