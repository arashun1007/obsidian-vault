/// Helpers for turning a list of season months into readable Japanese.
class Season {
  /// Collapse a month list like [12,1,2] into "12〜2月" style ranges,
  /// handling the year wrap.
  static String label(List<int> months) {
    if (months.isEmpty) return '通年';
    if (months.length >= 11) return '通年';

    final sorted = [...months]..sort();
    // Detect a wrap-around run (e.g. Nov, Dec, Jan, Feb).
    final set = sorted.toSet();
    final ranges = <String>[];

    final visited = <int>{};
    for (final start in sorted) {
      if (visited.contains(start)) continue;
      // Only begin a range if the previous month is absent (true start).
      final prev = start == 1 ? 12 : start - 1;
      if (set.contains(prev)) continue;

      var end = start;
      visited.add(start);
      while (true) {
        final next = end == 12 ? 1 : end + 1;
        if (set.contains(next) && !visited.contains(next)) {
          visited.add(next);
          end = next;
        } else {
          break;
        }
      }
      ranges.add(start == end ? '$start月' : '$start〜$end月');
    }
    return ranges.join('・');
  }

  static const monthNames = [
    '', '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ];
}
