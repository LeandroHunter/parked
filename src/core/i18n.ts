// Every piece of text the app shows, in English and German. Pure data plus a lookup, so the
// tests can check that the two languages have the same keys and the same placeholders.

export type Language = 'en' | 'de';

export const LANGUAGES: readonly Language[] = ['en', 'de'];

const en = {
  'language.label': 'Language',

  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.done': 'Done',
  'common.close': 'Close',
  'common.tryAgain': 'Try again',
  'common.previousKept': 'Your previous spot is still saved.',
  'common.adjustPin': 'Adjust the pin on a map',

  'home.empty.title': 'Just parked?',
  'home.empty.text': 'One tap saves this spot on your phone.',
  'home.park': 'Parked',
  'home.installHint': 'Add Parked to your Home Screen (Share › Add to Home Screen) so iOS keeps your saved spot.',

  'saving.title': 'Saving your spot…',
  'saving.start': 'Getting a fresh GPS fix.',
  'saving.waiting': 'Waiting a moment for the most accurate fix.',
  'saving.permission': 'Allow location access so Parked can save this spot.',
  'saving.doneTitle': 'Spot saved',
  'saving.doneDetail': 'Accurate to about {accuracy}.',

  'decision.title': 'Your location is vague',
  'decision.detail':
    'The best fix was only accurate to about {accuracy}. That is a rough area, not a parking space, so it has not been saved yet.',
  'decision.approx': 'Save approximate spot ({accuracy})',

  'problem.title': 'Couldn’t save your spot',
  'problem.denied.title': 'Location is off for Parked',
  'problem.denied.detail': 'Parked needs your location for a moment to save where the car is.',
  'problem.denied.step1': 'Open Settings › Privacy & Security › Location Services and make sure it is on.',
  'problem.denied.app.step2': 'In the same list, find Parked (or Safari Websites) and choose While Using the App.',
  'problem.denied.app.step3': 'Turn on Precise Location, then come back and try again.',
  'problem.denied.web.step2': 'Tap Safari Websites and choose While Using the App, with Precise Location on.',
  'problem.denied.web.step3': 'If you tapped “Don’t Allow” on this page: reload it and choose Allow.',
  'problem.noFix.title': 'No location signal',
  'problem.noFix.detail':
    'No fresh GPS fix arrived within {seconds} seconds, so nothing was saved. Step into the open, away from the car park roof or tall buildings, and try again.',
  'problem.unsupported.title': 'Location isn’t available',
  'problem.unsupported.detail': 'This browser does not provide location, so Parked cannot save a spot here.',
  'problem.insecure.title': 'Secure connection needed',
  'problem.insecure.detail':
    'Browsers only share location with pages loaded over https. Open Parked from its https address.',
  'problem.storage.detail':
    'The location was found but could not be written to this phone’s storage, so it was not saved. If you are in Private Browsing, switch to a normal tab. Otherwise free up some space and try again.',
  'problem.interrupted.title': 'Saving was interrupted',
  'problem.interrupted.detail': 'Parked went to the background before a location was saved, so nothing was changed.',
  'problem.corrupt.title': 'Saved spot can’t be read',
  'problem.corrupt.detail':
    'The stored parking spot is damaged and cannot be shown. You can clear it and save a new one.',
  'problem.corrupt.clear': 'Clear it',

  'saved.title': 'Parked {elapsed}',
  'saved.gps': 'Saved {when}, accurate to about {accuracy}.',
  'saved.approx': 'Saved {when}. Approximate spot only: {accuracy}.',
  'saved.manual': 'Saved {when}. You placed the pin on the map by hand.',
  'saved.whenToday': 'at {time}',
  'saved.whenOther': '{date}, {time}',
  'saved.addDetails': 'Add level, bay or photo',
  'saved.editDetails': 'Edit details',
  'saved.find': 'Find my car',
  'saved.found': 'I found my car',
  'saved.repark': 'Park here instead',

  'facts.level': 'Level',
  'facts.note': 'Note',
  'photo.view': 'View parking photo',
  'photo.alt': 'Parking photo',

  'elapsed.now': 'just now',
  'elapsed.minutes': '{minutes} min ago',
  'elapsed.hours': '{hours} h ago',
  'elapsed.hoursMinutes': '{hours} h {minutes} min ago',
  'elapsed.yesterday': 'yesterday',
  'elapsed.days': '{days} days ago',

  'unit.metres': 'metres',
  'unit.kilometres': 'kilometres',
  'unit.feet': 'feet',
  'unit.miles': 'miles',
  'age.seconds': '{count} s',
  'age.minutes': '{count} min',

  'guide.map': 'Map',
  'guide.fineprint':
    'The arrow shows a straight line, not a walking route. It can point through buildings, fences or across roads.',
  'guide.appleMaps': 'Open walking directions in Apple Maps',
  'guide.enableCompass': 'Enable compass',
  'guide.signals': 'Signal quality',
  'guide.simulated': 'Simulated',

  'dial.label': 'Direction to your car',
  'dial.finding': 'Finding you…',
  'dial.locationOff': 'Location is off',
  'dial.noLocation': 'No location',
  'dial.compassOff': 'Compass is off',
  'dial.readingCompass': 'Reading compass…',
  'dial.noDirection': 'No reliable direction',

  'near.title': 'Near your saved spot',
  'near.caption': 'Within about {distance}. Look around, and check your note or photo.',
  'distance.stale': 'Last known distance, {age} old',
  'distance.straight': 'in a straight line',
  'distance.straightTo': 'in a straight line, to the {direction}',
  'distance.locating': 'Getting a fresh location…',
  'distance.unknown': 'Distance unknown',

  'cardinal.north': 'north',
  'cardinal.north-east': 'north-east',
  'cardinal.east': 'east',
  'cardinal.south-east': 'south-east',
  'cardinal.south': 'south',
  'cardinal.south-west': 'south-west',
  'cardinal.west': 'west',
  'cardinal.north-west': 'north-west',

  'signal.locating': 'Locating…',
  'signal.noLocation': 'No location',
  'signal.locationStale': 'Location out of date',
  'signal.location': 'Location {accuracy}',
  'signal.compassOff': 'Compass off',
  'signal.readingCompass': 'Reading compass…',
  'signal.noCompass': 'No compass reading',
  'signal.compassStopped': 'Compass stopped',
  'signal.compass.good': 'Compass good',
  'signal.compass.fair': 'Compass fair',
  'signal.compass.poor': 'Compass poor',

  'advice.location.denied':
    'Parked can’t see your location. In Settings › Privacy & Security › Location Services, turn Location Services on and set Safari Websites (or Parked) to While Using.',
  'advice.location.insecure': 'Location only works on a secure (https) page.',
  'advice.location.unsupported': 'This browser does not provide location.',
  'advice.location.missing':
    'No location signal. Move into the open, away from tall buildings and out of car parks.',
  'advice.location.stale':
    'Your location has stopped updating. Move into the open; the arrow returns when a fresh fix arrives.',
  'advice.location.approximate':
    'iOS is only sharing your approximate location. Turn on Precise Location for this site in Settings › Privacy & Security › Location Services.',
  'advice.location.weak': 'Weak location signal ({accuracy}). Move into the open for a steadier direction.',
  'advice.spot.approximate':
    'This spot was saved with a vague location. Treat the direction as a rough area and rely on your note or photo.',
  'advice.compass.permission': 'The arrow needs your phone’s compass. Tap Enable compass, then Allow.',
  'advice.compass.denied':
    'Compass access was declined, so there is no arrow. Close this page completely, open it again and choose Allow. The distance and map still work.',
  'advice.compass.unsupported':
    'This device is not providing a compass, so there is no arrow. Use the distance and the map.',
  'advice.compass.missing': 'Waiting for the compass. Hold the phone flat and move it a little.',
  'advice.compass.stale': 'Compass readings have stopped. Hold the phone flat and move it a little.',
  'advice.compass.uncalibrated':
    'The compass needs calibrating. Move the phone in a figure of eight, away from cars and metal.',
  'advice.compass.poor':
    'Compass accuracy is low. Step away from cars and metal and move the phone in a figure of eight.',
  'advice.compass.magnetic': 'Using magnetic north; the direction may be a few degrees off.',

  'spoken.near': 'Near your saved spot. No direction is shown this close.',
  'spoken.finding': 'Finding your location.',
  'spoken.noLocation': 'No location. Direction unavailable.',
  'spoken.noDirection': 'Your car is {distance} away. Direction unavailable.',
  'spoken.arrow': 'Your car is at {hour} o’clock, {distance} away in a straight line.',
  'spoken.arrowRough': 'Your car is roughly at {hour} o’clock, {distance} away in a straight line.',
  'spoken.nearShort': 'Near your saved spot.',

  'details.title': 'Parking details',
  'details.note': 'Optional. These help when GPS can’t, like in a multi-storey or underground car park.',
  'details.level': 'Level or floor',
  'details.bay': 'Bay or note',
  'details.bayPlaceholder': 'Bay 417, near the lifts',
  'details.photo': 'Photo',
  'details.addPhoto': 'Add a photo',
  'details.replacePhoto': 'Replace photo',
  'details.removePhoto': 'Remove photo',
  'details.saveError': 'These details could not be saved. Your parking spot itself is unchanged.',
  'details.photoError': 'That photo could not be saved. Try a different one.',
  'details.photoRemoveError': 'The photo could not be removed.',

  'pin.title': 'Adjust pin',
  'pin.use': 'Use this spot',
  'pin.note': 'Drag the map until the pin sits on your car.',
  'pin.tiles': 'Map tiles need an internet connection. Without them, the pin cannot be placed reliably.',
  'pin.loadError': 'The map could not be loaded. Check your connection and try again.',
  'pin.saveError': 'The pin could not be saved.',
  'pin.moved': 'Pin moved.',

  'map.title': 'Map',
  'map.note': 'Red is your saved spot. The dark dot is you.',
  'map.offline':
    'You appear to be offline, so the map background may be blank. The markers are still correct.',
  'map.tiles': 'Map tiles need an internet connection. The markers are still correct.',
  'map.loadError': 'The map could not be loaded. Check your connection.',
  'map.car': 'Your saved spot',
  'map.me': 'You',

  'found.title': 'Found your car?',
  'found.text': 'This ends the parking session and removes the saved spot, note and photo from this phone.',
  'found.yes': 'Yes, end session',
  'found.no': 'Not yet',
  'replace.title': 'Replace your saved spot?',
  'replace.text':
    'Your current spot (parked {elapsed}) is kept until the new one has been saved, then replaced along with its note and photo.',
  'replace.yes': 'Save a new spot here',
  'replace.no': 'Keep current spot',

  'toast.saved': 'Spot saved.',
  'toast.ended': 'Parking session ended.',
  'toast.clearFailed': 'The spot could not be removed. Please try again.',
  'toast.corruptClearFailed': 'The damaged spot could not be cleared.',
};

export type TranslationKey = keyof typeof en;

const de: Record<TranslationKey, string> = {
  'language.label': 'Sprache',

  'common.cancel': 'Abbrechen',
  'common.back': 'Zurück',
  'common.done': 'Fertig',
  'common.close': 'Schließen',
  'common.tryAgain': 'Erneut versuchen',
  'common.previousKept': 'Dein bisheriger Platz ist weiterhin gespeichert.',
  'common.adjustPin': 'Position auf der Karte anpassen',

  'home.empty.title': 'Gerade geparkt?',
  'home.empty.text': 'Ein Tipp speichert diesen Platz auf deinem Handy.',
  'home.park': 'Geparkt',
  'home.installHint':
    'Füge Parked zum Home-Bildschirm hinzu (Teilen › Zum Home-Bildschirm), damit iOS deinen gespeicherten Platz behält.',

  'saving.title': 'Platz wird gespeichert …',
  'saving.start': 'Aktueller GPS-Standort wird ermittelt.',
  'saving.waiting': 'Einen Moment, der genaueste Standort wird abgewartet.',
  'saving.permission': 'Erlaube den Standortzugriff, damit Parked diesen Platz speichern kann.',
  'saving.doneTitle': 'Platz gespeichert',
  'saving.doneDetail': 'Auf etwa {accuracy} genau.',

  'decision.title': 'Dein Standort ist ungenau',
  'decision.detail':
    'Der beste Standort war nur auf etwa {accuracy} genau. Das ist ein grober Bereich und kein Parkplatz, deshalb wurde noch nichts gespeichert.',
  'decision.approx': 'Ungefähren Platz speichern ({accuracy})',

  'problem.title': 'Platz konnte nicht gespeichert werden',
  'problem.denied.title': 'Standort ist für Parked aus',
  'problem.denied.detail': 'Parked braucht kurz deinen Standort, um zu speichern, wo das Auto steht.',
  'problem.denied.step1':
    'Öffne Einstellungen › Datenschutz & Sicherheit › Ortungsdienste und prüfe, ob sie eingeschaltet sind.',
  'problem.denied.app.step2':
    'Suche in derselben Liste Parked (oder Safari-Websites) und wähle „Beim Verwenden der App“.',
  'problem.denied.app.step3': 'Schalte „Genauer Standort“ ein, komm dann zurück und versuch es erneut.',
  'problem.denied.web.step2':
    'Tippe auf Safari-Websites und wähle „Beim Verwenden der App“, mit „Genauer Standort“ eingeschaltet.',
  'problem.denied.web.step3':
    'Falls du auf dieser Seite „Nicht erlauben“ getippt hast: Lade sie neu und wähle „Erlauben“.',
  'problem.noFix.title': 'Kein Standortsignal',
  'problem.noFix.detail':
    'Innerhalb von {seconds} Sekunden kam kein aktueller GPS-Standort an, deshalb wurde nichts gespeichert. Geh ins Freie, weg vom Parkhausdach oder von hohen Gebäuden, und versuch es erneut.',
  'problem.unsupported.title': 'Standort nicht verfügbar',
  'problem.unsupported.detail':
    'Dieser Browser liefert keinen Standort, deshalb kann Parked hier keinen Platz speichern.',
  'problem.insecure.title': 'Sichere Verbindung nötig',
  'problem.insecure.detail':
    'Browser geben den Standort nur an Seiten weiter, die über https geladen wurden. Öffne Parked über die https-Adresse.',
  'problem.storage.detail':
    'Der Standort wurde gefunden, konnte aber nicht im Speicher dieses Handys abgelegt werden und ist deshalb nicht gespeichert. Falls du im privaten Modus surfst, wechsle in einen normalen Tab. Sonst gib etwas Speicherplatz frei und versuch es erneut.',
  'problem.interrupted.title': 'Speichern wurde unterbrochen',
  'problem.interrupted.detail':
    'Parked ist in den Hintergrund gewechselt, bevor ein Standort gespeichert war. Es wurde nichts geändert.',
  'problem.corrupt.title': 'Gespeicherter Platz nicht lesbar',
  'problem.corrupt.detail':
    'Der gespeicherte Parkplatz ist beschädigt und kann nicht angezeigt werden. Du kannst ihn löschen und einen neuen speichern.',
  'problem.corrupt.clear': 'Löschen',

  'saved.title': 'Geparkt {elapsed}',
  'saved.gps': 'Gespeichert {when}, auf etwa {accuracy} genau.',
  'saved.approx': 'Gespeichert {when}. Nur ungefährer Platz: {accuracy}.',
  'saved.manual': 'Gespeichert {when}. Du hast die Position selbst auf der Karte gesetzt.',
  'saved.whenToday': 'um {time}',
  'saved.whenOther': 'am {date} um {time}',
  'saved.addDetails': 'Ebene, Stellplatz oder Foto hinzufügen',
  'saved.editDetails': 'Details bearbeiten',
  'saved.find': 'Auto finden',
  'saved.found': 'Auto gefunden',
  'saved.repark': 'Hier neu parken',

  'facts.level': 'Ebene',
  'facts.note': 'Notiz',
  'photo.view': 'Parkfoto ansehen',
  'photo.alt': 'Parkfoto',

  'elapsed.now': 'gerade eben',
  'elapsed.minutes': 'vor {minutes} Min.',
  'elapsed.hours': 'vor {hours} Std.',
  'elapsed.hoursMinutes': 'vor {hours} Std. {minutes} Min.',
  'elapsed.yesterday': 'gestern',
  'elapsed.days': 'vor {days} Tagen',

  'unit.metres': 'Meter',
  'unit.kilometres': 'Kilometer',
  'unit.feet': 'Fuß',
  'unit.miles': 'Meilen',
  'age.seconds': '{count} Sek.',
  'age.minutes': '{count} Min.',

  'guide.map': 'Karte',
  'guide.fineprint':
    'Der Pfeil zeigt die Luftlinie, keinen Fußweg. Er kann durch Gebäude, Zäune oder über Straßen zeigen.',
  'guide.appleMaps': 'Fußweg in Apple Karten öffnen',
  'guide.enableCompass': 'Kompass aktivieren',
  'guide.signals': 'Signalqualität',
  'guide.simulated': 'Simuliert',

  'dial.label': 'Richtung zu deinem Auto',
  'dial.finding': 'Standort wird gesucht …',
  'dial.locationOff': 'Standort ist aus',
  'dial.noLocation': 'Kein Standort',
  'dial.compassOff': 'Kompass ist aus',
  'dial.readingCompass': 'Kompass wird gelesen …',
  'dial.noDirection': 'Keine verlässliche Richtung',

  'near.title': 'Nah an deinem Platz',
  'near.caption': 'Im Umkreis von etwa {distance}. Schau dich um und nutze deine Notiz oder dein Foto.',
  'distance.stale': 'Letzte bekannte Entfernung, {age} alt',
  'distance.straight': 'Luftlinie',
  'distance.straightTo': 'Luftlinie, Richtung {direction}',
  'distance.locating': 'Aktueller Standort wird ermittelt …',
  'distance.unknown': 'Entfernung unbekannt',

  'cardinal.north': 'Norden',
  'cardinal.north-east': 'Nordosten',
  'cardinal.east': 'Osten',
  'cardinal.south-east': 'Südosten',
  'cardinal.south': 'Süden',
  'cardinal.south-west': 'Südwesten',
  'cardinal.west': 'Westen',
  'cardinal.north-west': 'Nordwesten',

  'signal.locating': 'Ortung …',
  'signal.noLocation': 'Kein Standort',
  'signal.locationStale': 'Standort veraltet',
  'signal.location': 'Standort {accuracy}',
  'signal.compassOff': 'Kompass aus',
  'signal.readingCompass': 'Kompass wird gelesen …',
  'signal.noCompass': 'Kein Kompasswert',
  'signal.compassStopped': 'Kompass steht',
  'signal.compass.good': 'Kompass gut',
  'signal.compass.fair': 'Kompass mäßig',
  'signal.compass.poor': 'Kompass schwach',

  'advice.location.denied':
    'Parked sieht deinen Standort nicht. Schalte unter Einstellungen › Datenschutz & Sicherheit › Ortungsdienste die Ortungsdienste ein und stelle Safari-Websites (oder Parked) auf „Beim Verwenden“.',
  'advice.location.insecure': 'Der Standort funktioniert nur auf einer sicheren Seite (https).',
  'advice.location.unsupported': 'Dieser Browser liefert keinen Standort.',
  'advice.location.missing':
    'Kein Standortsignal. Geh ins Freie, weg von hohen Gebäuden und raus aus dem Parkhaus.',
  'advice.location.stale':
    'Dein Standort wird nicht mehr aktualisiert. Geh ins Freie. Der Pfeil kommt zurück, sobald ein aktueller Standort da ist.',
  'advice.location.approximate':
    'iOS gibt nur deinen ungefähren Standort weiter. Schalte für diese Seite „Genauer Standort“ ein: Einstellungen › Datenschutz & Sicherheit › Ortungsdienste.',
  'advice.location.weak': 'Schwaches Standortsignal ({accuracy}). Geh ins Freie, dann wird die Richtung ruhiger.',
  'advice.spot.approximate':
    'Dieser Platz wurde mit ungenauem Standort gespeichert. Nimm die Richtung als groben Bereich und verlass dich auf Notiz oder Foto.',
  'advice.compass.permission':
    'Der Pfeil braucht den Kompass deines Handys. Tippe auf „Kompass aktivieren“ und dann auf „Erlauben“.',
  'advice.compass.denied':
    'Der Kompasszugriff wurde abgelehnt, deshalb gibt es keinen Pfeil. Schließe diese Seite ganz, öffne sie erneut und wähle „Erlauben“. Entfernung und Karte funktionieren weiter.',
  'advice.compass.unsupported':
    'Dieses Gerät liefert keinen Kompass, deshalb gibt es keinen Pfeil. Nutze die Entfernung und die Karte.',
  'advice.compass.missing': 'Warte auf den Kompass. Halte das Handy flach und bewege es ein wenig.',
  'advice.compass.stale': 'Der Kompass liefert keine Werte mehr. Halte das Handy flach und bewege es ein wenig.',
  'advice.compass.uncalibrated':
    'Der Kompass muss kalibriert werden. Bewege das Handy in einer Acht, weg von Autos und Metall.',
  'advice.compass.poor':
    'Der Kompass ist ungenau. Geh von Autos und Metall weg und bewege das Handy in einer Acht.',
  'advice.compass.magnetic': 'Es wird der magnetische Norden genutzt. Die Richtung kann um ein paar Grad abweichen.',

  'spoken.near': 'Nah an deinem Platz. So nah wird keine Richtung angezeigt.',
  'spoken.finding': 'Dein Standort wird gesucht.',
  'spoken.noLocation': 'Kein Standort. Richtung nicht verfügbar.',
  'spoken.noDirection': 'Dein Auto ist {distance} entfernt. Richtung nicht verfügbar.',
  'spoken.arrow': 'Dein Auto ist auf {hour} Uhr, {distance} Luftlinie entfernt.',
  'spoken.arrowRough': 'Dein Auto ist ungefähr auf {hour} Uhr, {distance} Luftlinie entfernt.',
  'spoken.nearShort': 'Nah an deinem Platz.',

  'details.title': 'Parkdetails',
  'details.note': 'Optional. Hilft dort, wo GPS versagt, etwa im Parkhaus oder in der Tiefgarage.',
  'details.level': 'Ebene oder Etage',
  'details.bay': 'Stellplatz oder Notiz',
  'details.bayPlaceholder': 'Platz 417, bei den Aufzügen',
  'details.photo': 'Foto',
  'details.addPhoto': 'Foto hinzufügen',
  'details.replacePhoto': 'Foto ersetzen',
  'details.removePhoto': 'Foto entfernen',
  'details.saveError': 'Die Details konnten nicht gespeichert werden. Dein Parkplatz selbst ist unverändert.',
  'details.photoError': 'Das Foto konnte nicht gespeichert werden. Versuch ein anderes.',
  'details.photoRemoveError': 'Das Foto konnte nicht entfernt werden.',

  'pin.title': 'Position anpassen',
  'pin.use': 'Übernehmen',
  'pin.note': 'Verschiebe die Karte, bis die Nadel auf deinem Auto sitzt.',
  'pin.tiles':
    'Die Karte braucht eine Internetverbindung. Ohne sie lässt sich die Position nicht zuverlässig setzen.',
  'pin.loadError': 'Die Karte konnte nicht geladen werden. Prüfe deine Verbindung und versuch es erneut.',
  'pin.saveError': 'Die Position konnte nicht gespeichert werden.',
  'pin.moved': 'Position verschoben.',

  'map.title': 'Karte',
  'map.note': 'Rot ist dein gespeicherter Platz. Der dunkle Punkt bist du.',
  'map.offline':
    'Du bist anscheinend offline, der Kartenhintergrund bleibt vielleicht leer. Die Markierungen stimmen trotzdem.',
  'map.tiles': 'Die Karte braucht eine Internetverbindung. Die Markierungen stimmen trotzdem.',
  'map.loadError': 'Die Karte konnte nicht geladen werden. Prüfe deine Verbindung.',
  'map.car': 'Dein gespeicherter Platz',
  'map.me': 'Du',

  'found.title': 'Auto gefunden?',
  'found.text':
    'Damit endet der Parkvorgang. Gespeicherter Platz, Notiz und Foto werden von diesem Handy gelöscht.',
  'found.yes': 'Ja, beenden',
  'found.no': 'Noch nicht',
  'replace.title': 'Gespeicherten Platz ersetzen?',
  'replace.text':
    'Dein aktueller Platz (geparkt {elapsed}) bleibt erhalten, bis der neue gespeichert ist. Danach wird er samt Notiz und Foto ersetzt.',
  'replace.yes': 'Hier neuen Platz speichern',
  'replace.no': 'Aktuellen Platz behalten',

  'toast.saved': 'Platz gespeichert.',
  'toast.ended': 'Parkvorgang beendet.',
  'toast.clearFailed': 'Der Platz konnte nicht gelöscht werden. Bitte versuch es erneut.',
  'toast.corruptClearFailed': 'Der beschädigte Eintrag konnte nicht gelöscht werden.',
};

export const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = { en, de };

export type TranslationParams = Record<string, string | number>;

/** Looks up a string and fills in its `{placeholders}`. */
export function translate(language: Language, key: TranslationKey, params?: TranslationParams): string {
  const template = TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function isTranslationKey(value: string): value is TranslationKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}

/** Which language to start in: an explicit earlier choice wins, otherwise the phone's own language. */
export function pickLanguage(saved: string | null | undefined, deviceLanguages: readonly string[]): Language {
  if (saved === 'en' || saved === 'de') return saved;
  for (const tag of deviceLanguages) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (primary === 'de') return 'de';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

/** Decimal separator used when a distance needs one ("1.2 km" / "1,2 km"). */
export function decimalSeparator(language: Language): string {
  return language === 'de' ? ',' : '.';
}
