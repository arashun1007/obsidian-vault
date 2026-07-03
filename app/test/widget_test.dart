import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sakana_zukan/models/fish.dart';
import 'package:sakana_zukan/util/season.dart';

Fish _sample({
  String name = 'マダイ',
  String kana = 'まだい',
  List<String> aliases = const ['サクラダイ'],
  List<int> season = const [3, 4, 5],
}) {
  return Fish(
    id: 'madai',
    name: name,
    kana: kana,
    scientificName: 'Pagrus major',
    family: 'タイ科',
    category: 'white',
    categoryLabel: '白身魚',
    accentColor: const Color(0xFF6FA8A0),
    seasonMonths: season,
    typicalSizeCm: 80,
    distribution: '本州〜九州',
    habitat: '岩礁',
    taste: '上品な甘み',
    cookingMethods: const ['刺身'],
    aliases: aliases,
    description: '魚の王様。',
  );
}

void main() {
  group('Season.label', () {
    test('collapses consecutive months into a range', () {
      expect(Season.label([3, 4, 5]), '3〜5月');
    });

    test('handles a single month', () {
      expect(Season.label([9]), '9月');
    });

    test('wraps around the year boundary', () {
      expect(Season.label([12, 1, 2]), '12〜2月');
    });

    test('keeps disjoint ranges separate', () {
      expect(Season.label([4, 5, 9, 10]), '4〜5月・9〜10月');
    });

    test('reports 通年 when nearly every month is listed', () {
      expect(Season.label(List.generate(12, (i) => i + 1)), '通年');
    });
  });

  group('Fish.matches', () {
    test('matches the standard name', () {
      expect(_sample().matches('マダイ'), isTrue);
    });

    test('matches an alias', () {
      expect(_sample().matches('サクラ'), isTrue);
    });

    test('matches the scientific name case-insensitively', () {
      expect(_sample().matches('pagrus'), isTrue);
    });

    test('returns false for an unrelated query', () {
      expect(_sample().matches('マグロ'), isFalse);
    });

    test('empty query matches everything', () {
      expect(_sample().matches(''), isTrue);
    });
  });

  group('Fish.inSeason', () {
    test('true for a listed month', () {
      expect(_sample(season: [3, 4, 5]).inSeason(4), isTrue);
    });
    test('false for an unlisted month', () {
      expect(_sample(season: [3, 4, 5]).inSeason(8), isFalse);
    });
  });
}
