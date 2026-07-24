import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';

import { parseDayKey } from '@/core/dates';
import { firstLine, restSnippet } from '@/features/notes/preview';
import { useAppStore } from '@/store';
import { noteSerif } from '@/theme';
import { useThemeColors } from '@/theme/hooks';

export default function NotesScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const notes = useAppStore((s) => s.notes);
  const noteLinks = useAppStore((s) => s.noteLinks);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );
  const linkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of noteLinks) counts.set(link.noteId, (counts.get(link.noteId) ?? 0) + 1);
    return counts;
  }, [noteLinks]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.textMuted, fontFamily: noteSerif }}>
            Write a note. It can stay a note, or become an event or a reminder.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(note) => note.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: note }) => {
            const snippet = restSnippet(note.body);
            const links = linkCounts.get(note.id) ?? 0;
            return (
              <Pressable
                onPress={() => router.push(`/note/${note.id}`)}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <Text
                  style={[styles.rowTitle, { color: colors.text, fontFamily: noteSerif }]}
                  numberOfLines={1}
                >
                  {firstLine(note.body)}
                </Text>
                {snippet.length > 0 && (
                  <Text
                    style={{ color: colors.textMuted, fontFamily: noteSerif }}
                    numberOfLines={2}
                  >
                    {snippet}
                  </Text>
                )}
                {(note.date || links > 0) && (
                  <View style={styles.metaRow}>
                    {note.date && (
                      <View style={[styles.dateChip, { borderColor: colors.accent }]}>
                        <Text style={{ color: colors.accent, fontSize: 12 }}>
                          {(() => {
                            const { year, month0, day } = parseDayKey(note.date);
                            return format(new Date(year, month0, day, 12), 'MMM d, yyyy');
                          })()}
                        </Text>
                      </View>
                    )}
                    {links > 0 && (
                      <View style={styles.linkBadge}>
                        <Ionicons name="link-outline" size={14} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{links}</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => router.push('/note/new')}
        style={[styles.fab, { backgroundColor: colors.accent }]}
      >
        <Ionicons name="add" size={28} color={colors.surface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 10, paddingBottom: 96 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  rowTitle: { fontSize: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dateChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  linkBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});
