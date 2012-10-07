/*jslint evil:true*/

inter = {
    renderers: {},

    leftPad: function (str, length, padChar) {
        str = String(str);
        while (str.length < length) {
            str = padChar + str;
        }
        return str;
    },

    trQuantity: function (patternByQuantity, number) { // ...
        return this.getPatternRenderer(patternByQuantity[this.getQuantity(number)]).call(this, Array.prototype.slice.call(arguments, 1));
    },

    /**
     * Render a list of items as dictated by the locale. The formats
     * are extracted from CLDR (<a
     * href='http://cldr.unicode.org/development/design-proposals/list-formatting'>see
     * some examples</a>).
     *
     * Example invocation:
     * <pre><code>
     *   inter.renderList(["foo", "bar", "quux"]); // "foo, bar, and quux" (en_US).
     * </code></pre>
     * @param {String[]} list The list items.
     * @return {String} The rendered list.
     */
    renderList: function (list) {
        switch (list.length) {
        case 0:
            return "";
        case 1:
            return list[0];
        case 2:
            if ('2' in this.listPatterns) {
                return this.renderPattern(list, this.listPatterns['2']);
            }
            /* falls through */
        default:
            var str = this.renderPattern(list.slice(-2), this.listPatterns.end || "{0}, {1}");
            for (var i = list.length - 3; i >= 0; i -= 1) {
                str = this.renderPattern([list[i], str], (!i && this.listPatterns.start) || this.listPatterns.middle || "{0}, {1}");
            }
            return str;
        }
    },

    /**
     * Tokenize a pattern with placeholders for mapping.
     * @param (String) pattern The pattern to tokenize.
     * @return {Array} An array of text and placeholder objects
     * @static
     */
    tokenizePattern: function (pattern) {
        var tokens = [];
        // Split pattern into tokens (return value of replace isn't used):
        pattern.replace(/\{(\d+)\}|([^\{]+)/g, function ($0, placeHolderNumber, text) {
            if (text) {
                tokens.push({
                    type: 'text',
                    value: text
                });
            } else {
                tokens.push({
                    type: 'placeHolder',
                    value: parseInt(placeHolderNumber, 10)
                });
            }
        });
        return tokens;
    },

    /**
     * Get a renderer function for a pattern. Default values for the
     * placeholders can be provided as further arguments (JavaScript
     * code fragments).
     * @param {String} pattern The pattern, e.g. <tt>"I like {0}
     * music"</tt>.
     * @param {String} placeHolderValue1 (optional) The value to
     * insert into the first placeholder.
     * @param {String} placeHolderValue2 (optional) The value to
     * insert into the second placeholder, and so on.
     * @return {Function} The renderer function (String[] => String).
     * @private (use renderPattern or getPatternRenderer)
     */
    makePatternRenderer: function (pattern) { // ...
        if (pattern) {
            var predefinedCodeFragments = [].slice.call(arguments, 1);
            return new Function("values", "return " + this.tokenizePattern(pattern).map(function (token) {
                if (token.type === 'placeHolder') {
                    return predefinedCodeFragments[token.value] || "values[" + token.value + "]";
                } else {
                    return "\"" + token.value.replace(/\"/g, "\\\"").replace(/\n/g, "\\n") + "\"";
                }
            }).join("+") + ";");
        } else {
            // Fail somewhat gracefully if no pattern was provided:
            return function () {
                return "[! makePatternRenderer: No pattern provided !]";
            };
        }
    },

    /**
     * Get a renderer function for a number with unit.
     * @param {String} unit The unit. Supported values: 'year',
     * 'week', 'month', 'day', 'hour', 'minute'.
     * @return {Function} The renderer function (String[] => String).
     * @private (use renderUnit or getUnitRenderer)
     */
    makeUnitRenderer: function (unit) {
        var quantityRenderers = {};
        for (var quantity in this.unitPatterns[unit]) {
            if (this.unitPatterns[unit].hasOwnProperty(quantity)) {
                quantityRenderers[quantity] = this.makePatternRenderer(pattern);
            }
        }
        return function (n) {
            return quantityRenderers[inter.getQuantity(n)]([n]);
        };
    },

    /**
     * Get a locale-specific renderer function for numbers. The
     * renderer outputs a fixed number of decimals. Thousands
     * separators are not supported yet.
     * @param {Number} numDecimals (optional) The fixed number of
     * decimals, defaults to <tt>0</tt>.
     * @param {Number} factor (optional) Factor to multiply all
     * numbers by (useful for rendering percentages and the likes).
     * @param {String} prefix (optional) String to prefix all
     * renderered numbers with (e.g. <tt>"$"</tt> or <tt>"DKK "</tt>).
     * @param {String} suffix (optional) String to suffix all
     * renderered numbers with (e.g. <tt>"%"</tt> or <tt>" m/s"</tt>).
     * @return {Function} The renderer function (Number => String).
     * @private (use renderNumber or getNumberRenderer)
     */
    makeNumberRenderer: function (numDecimals, factor, prefix, suffix) {
        return new Function("num",
                            "return " +
                                this.makeNumberRendererSource((typeof factor === 'undefined' ? '' : "" + factor + "*") + "num", numDecimals, prefix, suffix) +
                                (suffix ? "+'" + suffix.replace(/\'/g, "\\'") + "'" : "") + ";");
    },

    /**
     * Make a percentage renderer, honoring the locale's preferred
     * percent sign and number format. The renderer outputs a fixed
     * number of decimals.
     * @param {Number} numDecimals (optional) The fixed number of
     * decimals, defaults to <tt>0</tt>.
     * @returns {Function} The renderer function (Number => String).
     * @private (use renderPercentage or getPercentageRenderer)
     */
    makePercentageRenderer: function (numDecimals) {
        return new Function("num", "return " + this.makeNumberRendererSource("100*num", numDecimals, "", " " + this.numberSymbols.percentSign) + ";");
    },

    /**
     * Make a function for rendering a file size, ie. a number of
     * bytes. The renderer works like {@link
     * Ext.util.Format#fileSize}, but respects the locale's decimal
     * separator. Note: The strings <tt>bytes</tt>, <tt>KB</tt>,
     * <tt>MB</tt>, and <tt>GB</tt> are not localized yet, sorry!
     * @param {Number} numDecimals (optional) The fixed number of
     * decimals, defaults to <tt>0</tt>. Won't be used when the number
     * of bytes is less than or equal to 1000.
     * @return {Function} The file size renderer (Number => String).
     * @private (use renderFileSize or getFileSizeRenderer)
     */
    makeFileSizeRenderer: function (numDecimals) {
        return new Function("size",
                            "if (size < 1000) {" +
                                "return " + this.makeNumberRendererSource("size", 0, "", " bytes") + ";" +
                            "} else if (size < 1000000) {" +
                                "return " + this.makeNumberRendererSource("size/1024", numDecimals, "", " KB") + ";" +
                            "} else if (size < 1000000000) {" +
                                "return " + this.makeNumberRendererSource("size/1048576", numDecimals, "", " MB") + ";" +
                            "} else if (size < 1000000000000) {" +
                                "return " + this.makeNumberRendererSource("size/1073741824", numDecimals, "", " GB") + ";" +
                            "} else {" +
                                "return " + this.makeNumberRendererSource("size/1099511627776", numDecimals, "", " TB") + ";" +
                            "}");
    },

    /**
     * Make a JavaScript code fragment for rendering a number in the
     * locale's number format with a fixed number of decimals. Useful
     * in a <tt>new Function("...")</tt> construct.
     * @param {String} sourceVariableNameOrExpression JavaScript
     * expression representing the number to render, a variable name
     * in the simple case.
     * @return {String} The JavaScript code fragment.
     * @private
     */
    makeNumberRendererSource: function (sourceVariableNameOrExpression, numDecimals, prefix, suffix) {
        return (prefix ? "'" + prefix.replace(/\'/g, "\\'") + "'+" : "") +
            "(" + sourceVariableNameOrExpression + ")" +
            ".toFixed(" + (numDecimals || 0) + ")" +
            (this.numberSymbols.decimalPoint === '.' ? "" : ".replace('.', '" + this.numberSymbols.decimal.replace(/\'/g, "\\'") + "')") +
            (suffix ? "+'" + suffix.replace(/\'/g, "\\'") + "'" : "");
    },

    tokenizeDateFormat: function (format) {
        var tokens = [];
        format.replace(/([^a-z']+)|'(')|'((?:[^']|'')+)'|(([a-z])\5*)/gi, function ($0, unescapedText, escapedSingleQuote, escapedText, fieldToken) {
            if (fieldToken) {
                tokens.push({type: 'field', value: fieldToken});
            } else {
                if (escapedText) {
                    escapedText = escapedText.replace(/''/g, "'");
                }
                tokens.push({type: 'text', value: (unescapedText || escapedSingleQuote || escapedText || $0).replace(/"/g, '\\"')});
            }
        });
        return tokens;
    },

    getCodeFragmentForDateField: (function () {
        var codeFragmentsByFormatChar = {
            G: ['inter.eraNames.abbreviated[{date}.getFullYear() > 0 ? 1 : 0]'], // Era designator
            y: ['inter.leftPad({date}.getFullYear(), 4, "0")'],
            //Y: [], // Week of Year
            //u: [], // Extended year
            Q: ['inter.leftPad(Math.floor({date}.getMonth()/4), 2, "0")', '*', 'inter.quarterNames.format.abbreviated[Math.floor({date}.getMonth()/4)]', 'inter.quarterNames.format.wide[Math.floor({date}.getMonth()/4)]'], // Quarter
            //q: [], // Stand alone quarter
            M: ['({date}.getMonth() + 1)', 'inter.leftPad({date}.getMonth() + 1, 2, "0")', 'inter.monthNames.format.abbreviated[{date}.getMonth()]', 'inter.monthNames.format.wide[{date}.getMonth()]'],
            L: ['({date}.getMonth() + 1)', 'inter.leftPad({date}.getMonth() + 1, 2, "0")', 'Date.getShortMonthName({date}.getMonth())', 'Date.monthNames[{date}.getMonth()]'],
            //w: [], // Week of year
            //W: [], // Week of month
            d: ['{date}.getDate()', 'inter.leftPad({date}.getDate(), 2, "0")'],
            //D: [], // Day of year
            //F: [], // Day of week in month
            //g: [], // Modified Julian day
            E: ['inter.dayNames.format.abbreviated[{date}.getDay()]', '*', '*', 'inter.dayNames.format.wide[{date}.getDay()]'],
            //e: [], // Local day of week
            //c: [], // Stand alone day of week
            a: ['({date}.getHours() < 12 ? "am" : "pm")'],
            h: ['(({date}.getHours() % 12) ? {date}.getHours() % 12 : 12)'],
            H: ['inter.leftPad({date}.getHours(), 2, "0")'],
            //k: [], // Hour in day (1-24)
            //K: [], // Hour in am/pm (0-11)
            m: ['inter.leftPad({date}.getMinutes(), 2, "0")'],
            s: ['inter.leftPad({date}.getSeconds(), 2, "0")']
            //S: [], // Millisecond
            //A: [], // Milliseconds in day
            //z: [], // Time zone: Specific non-location
            //Z: [], // Time zone: RFC 822/localized GMT
            //V: [], // Time zone: Generic (non-)location
            //W: [], // Week in month
        };

        return function (fieldToken, sourceVariableNameOrExpression) {
            var codeFragments = codeFragmentsByFormatChar[fieldToken[0]];
            if (codeFragments) {
                var codeFragmentNumber = Math.min(fieldToken.length, codeFragments.length) - 1;
                while (codeFragments[codeFragmentNumber] === '*') {
                    codeFragmentNumber -= 1;
                }
                return codeFragments[codeFragmentNumber].replace(/\{date\}/g, '(' + sourceVariableNameOrExpression + ')');
            }
        };
    }()),

    makeDateRendererSource: function (sourceVariableNameOrExpression, format) {
        var expressions = [];
        this.tokenizeDateFormat(format).forEach(function (token) {
            if (token.type === 'text') {
                expressions.push('"' + token.value.replace(/"/g, '\\"') + '"');
            } else {
                // token.type === 'field'
                var codeFragment = inter.getCodeFragmentForDateField(token.value, sourceVariableNameOrExpression);
                if (codeFragment) {
                    expressions.push(codeFragment);
                }
            }
        });
        return expressions.join('+');
    },

    /**
     * Make a locale-specific date renderer using one of the locale's
     * standard full/long/medium/short time or date formats, or given
     * by a CLDR <tt>dateFormatItem</tt> id (<a
     * href='http://unicode.org/reports/tr35/#dateFormats'>see some
     * examples</a>).
     * @param {String} formatId The CLDR id of the date format, or
     * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
     * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
     * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
     * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
     * @return {Function} The date renderer.
     * @private (use renderDate or getDateRenderer)
     */
    makeDateRenderer: function (formatId) {
        var format;
        if (formatId === 'hv') {
            // Hack: There's no 'hv' format in CLDR. Try to make one by stripping the minute part from the short time format:
            format = this.getDateFormat("shortTime").replace(/[\.:]i\s*/, "");
        } else {
            format = this.getDateFormat(formatId);
            if (!format) {
                throw new Error('inter.makeDateRenderer: Cannot find date format: ' + formatId);
            }
        }
        return new Function('d', 'return ' + this.makeDateRendererSource('d', format) + ';');
    },

    /**
     * Make a locale-specific date or date-time interval renderer
     * using one of the locale's standard full/long/medium/short time
     * or date formats, or specified by a CLDR <tt>dateFormatItem</tt>
     * id (<a href='http://unicode.org/reports/tr35/#timeFormats'>see
     * some examples</a>).
     * @param {String} formatId The CLDR id of the date format, or
     * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
     * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
     * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
     * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
     * @param {Boolean} datePartOnly Only render the date part when
     * using a fallback format (defaults to false).
     * @return {Function} The date or date-time interval renderer
     * (Object{start: Date, end: Date} => String).
     * @private (use renderDateInterval or getDateIntervalRenderer)
     */
    makeDateIntervalRenderer: function (formatId, datePartOnly) {
        var greatestDifferences = this.dateIntervalFormats[formatId];
        if (!greatestDifferences) {
            var bestMatchingDateIntervalFormatId = this.getBestICUFormatId(formatId, this.dateIntervalFormats);
            if (bestMatchingDateIntervalFormatId) {
                // Clone the best match, then adapt it:
                greatestDifferences = {};
                for (var key in this.dateIntervalFormats[bestMatchingDateIntervalFormatId]) {
                    greatestDifferences[key] = this.adaptICUFormat(this.dateIntervalFormats[bestMatchingDateIntervalFormatId][key], formatId);
                }
            }
        }
        if (greatestDifferences) {
            return this.makeDateIntervalRendererFromGreatestDifferences(greatestDifferences);
        } else {
            var matchFormatId = formatId.match(/^([yMQEd]+)([Hhms]+)$/);
            if (datePartOnly && matchFormatId) {
                // The requested format has both date and time components, but the caller only wants a date
                // interval renderer, so we can do a little better than the date interval fallback format by
                // only rendering the date part:
                var dateFormatId = matchFormatId[1],
                    timeFormatId = matchFormatId[2];
                return function (dateInterval) {
                    return inter.renderDateInterval(dateInterval, dateFormatId);
                };
            } else {
                // Create a fallback date interval renderer from the date format and the date interval fallback format:
                var dateFormat = this.getDateFormat(formatId);
                if (dateFormat) {
                    return this.getPatternRenderer(this.dateIntervalFallbackFormat,
                                                   this.makeDateRendererSource('values.start', dateFormat),
                                                   this.makeDateRendererSource('values.end', dateFormat));
                } else {
                    throw new Error("inter.renderDateInterval: No usable date interval format found for " + formatId);
                }
            }
        }
    },

    /**
     * Get one of the locale's standard full/long/medium/short time or
     * date formats, or a locale-specific format specified by a CLDR
     * <tt>dateFormatItem</tt> id (<a
     * href='http://unicode.org/reports/tr35/#dateFormats'>see some
     * examples</a>).
     *
     * Example invocation:
     * <pre><code>
     *   inter.getDateFormat("fullDate"); // "l, F j, Y" (en_US)
     * </code></pre>
     * @param {String} formatId The CLDR id of the date format, or
     * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
     * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
     * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
     * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
     * @return {String} The date format in ICU format, or undefined if no usable
     * format could be found.
     */
    getDateFormat: function (formatId) {
        var icuFormat = this.dateFormats.basic[formatId] || this.dateFormats.cldr[formatId];
        if (icuFormat) {
            return icuFormat;
        } else {
            // The exact format wasn't found.
            // See if we know a similar format that can be rewritten, explanation here: http://unicode.org/cldr/trac/ticket/2641
            var bestCandidateFormatId = this.getBestICUFormatId(formatId, this.dateFormats.cldr);
            if (bestCandidateFormatId) {
                return (this.dateFormats.cldr[formatId] = this.adaptICUFormat(this.dateFormats.cldr[bestCandidateFormatId], formatId));
            } else {
                // No suitable formats found
                var matchFormatId = formatId.match(/^y+M+d+$/);
                if (matchFormatId) {
                    // For some reason there's no yMd fragment in CLDR, adapt the short date format to the required level of detail:
                    return (this.dateFormats.cldr[formatId] = this.adaptICUFormat(this.dateFormats.basic.shortDate, formatId));
                }

                matchFormatId = formatId.match(/^([yMQEd]+)([Hhms]+)$/);
                if (matchFormatId) {
                    // It's a format with both date and time components. Try to lookup the date and time parts separately,
                    // then compose them using the default date time pattern:
                    var dateFormat = this.getDateFormat(matchFormatId[1]),
                        timeFormat = this.getDateFormat(matchFormatId[2]);
                    return dateFormat && timeFormat && this.renderPattern([timeFormat, dateFormat], this.defaultDateTimePattern);
                } else {
                    return; // No usable date format found
                }
            }
        }
    },

    /**
     * Make a date or date-time interval renderer from an ICU format
     * string.
     * @param {String} format The format.
     * @return {Function} The date or date-time interval renderer
     * function (Object{start: Date, end: Date} => String).
     * @private
     */
    makeDateIntervalRendererFromFormatString: function (format) {
        var expressions = [],
            seenFields = {};
        this.tokenizeDateFormat(format).forEach(function (token) {
            if (token.type === 'text') {
                expressions.push('"' + token.value.replace(/"/g, '\\"') + '"');
            } else {
                // token.type === 'field'
                expressions.push(inter.getCodeFragmentForDateField(token.value, 'dateInterval.' + (seenFields[token.value[0]] ? 'end' : 'start')));
                seenFields[token.value[0]] = true;
            }
        });
        return new Function('dateInterval', 'return ' + expressions.join('+') + ";");
    },

    /**
     * Make a date or date-time interval renderer from an object
     * representing the <tt>greatestDifferences</tt> date interval
     * formats as extracted from CLDR (see <a
     * href='http://unicode.org/reports/tr35/#dateTimeFormats'>see
     * some examples</a>) by <tt>build-locale.pl</tt>.
     * @param {Object} greatestDifferences Object containing the
     * greatestDifferences map.
     * @return {Function} The date or date-time interval renderer
     * (Object{start: Date, end: Date} => String).
     * @private
     */
    makeDateIntervalRendererFromGreatestDifferences: function (greatestDifferences) {
        var formatters = [],
            previousFormatter;
        ['y', 'M', 'd', 'a', 'h', 'm'].forEach(function (ch, i) {
            var formatter;
            if (ch in greatestDifferences) {
                formatter = this.makeDateIntervalRendererFromFormatString(greatestDifferences[ch]);
                if (!previousFormatter) {
                    for (var j = 0; j < i; j += 1) {
                        formatters[j] = formatter;
                    }
                }
                previousFormatter = formatters[i] = formatter;
            } else if (previousFormatter) {
                formatters[i] = previousFormatter;
            }
        }, this);
        var dateIntervalRenderers = {};
        for (var greatestDifference in greatestDifferences) {
            if (greatestDifferences.hasOwnProperty(greatestDifference)) {
                dateIntervalRenderers[greatestDifference] = this.makeDateIntervalRendererFromFormatString(greatestDifferences[greatestDifference]);
            }
        }
        return function (dateInterval) {
            if (dateInterval.start.getFullYear() !== dateInterval.end.getFullYear()) {
                return formatters[0](dateInterval);
            } else if (dateInterval.start.getMonth() !== dateInterval.end.getMonth()) {
                return formatters[1](dateInterval);
            } else if (dateInterval.start.getDate() !== dateInterval.end.getDate()) {
                return formatters[2](dateInterval);
            } else if ((dateInterval.start.getHours() >= 12) === (dateInterval.end.getHours() >= 12)) {
                return formatters[4](dateInterval);
            } else if (dateInterval.start.getHours() !== dateInterval.end.getHours()) {
                return formatters[3](dateInterval);
            } else {
                return formatters[5](dateInterval);
            }
        };
    },

    /**
     * Get the CLDR id of the best matching date or date-time format
     * given a (possible non-existent) CLDR
     * <tt>dateFormatItem</tt>-like id.
     * @param {String} formatId The CLDR id of the date or date-time
     * format to search for.
     * @param {Object} sourceObject The object to search for
     * candidates in, could be set to <tt>this.dateFormats.cldr</tt>
     * or <tt>this.dateIntervalFormats</tt>.
     * @return {String} The CLDR id of the best matching format, or
     * undefined if no candidate is found.
     * @private
     */
    getBestICUFormatId: function (formatId, sourceObject) {
        var bestCandidateFormatId,
            matcher = new RegExp("^" + formatId.replace(/(([a-zA-Z])\2*)/g, function ($0, formatToken, formatChar) {
                return formatChar + "{1," + formatToken.length + "}";
            }) + "$");
        // Find the longest matching candidate:
        for (var candidateFormatId in sourceObject) {
            if (matcher.test(candidateFormatId)) {
                if (!bestCandidateFormatId || candidateFormatId.length > bestCandidateFormatId.length) {
                    bestCandidateFormatId = candidateFormatId;
                }
            }
        }
        return bestCandidateFormatId;
    },

    /**
     * Adapt an ICU date format to a different level of detail as
     * specified by a CLDR <tt>dateFormatItem</tt> id. Typically used
     * in conjunction with inter.getBestICUFormatId. The
     * return value probably won't make sense if the parameters
     * specify incompatible formats.
     * @param {String} icuFormat The ICU format to adapt.
     * @param {String} adaptToFormatId The CLDR id specifying the
     * level of detail to adapt to.
     * @return {String} The adapted ICU format.
     * @private
     */
    adaptICUFormat: function (icuFormat, adaptToFormatId) {
        adaptToFormatId.replace(/(([a-zA-Z])\2*)/g, function ($0, formatToken, formatChar) { // For each token in the wanted format id
            // FIXME: This should probably be aware of quoted strings:
            icuFormat = icuFormat.replace(new RegExp(formatChar + "+", "g"), formatToken);
        });
        return icuFormat;
    }
};

/**
 * @name inter
 * @namespace inter
 */

/**
 * Render a number with unit in a locale-specific format.
 *
 * Example invocation:
 * <pre><code>
 *   inter.renderUnit(1, 'hour'); // "1 hour" (en_US locale)
 *   inter.renderUnit(14, 'month'); // "14 months" (en_US locale)
 * </code></pre>
 * @param {Number} number The number to render.
 * @param {String} unit The unit. Supported values: 'year',
 * 'week', 'month', 'day', 'hour', 'minute'.
 * @return {String} The rendered number with unit.
 * @name inter.renderUnit
 * @function
 */

/**
 * Get a locale-specific renderer function for numbers with units.
 *
 * Example invocation:
 * <pre><code>
 *   var weekRenderer = inter.getUnitRenderer('week');
 *   weekRenderer(10); // "10 weeks" (en_US)
 * </code></pre>
 * @param {String} unit The unit. Supported values: 'year', 'week',
 * 'month', 'day', 'hour', 'minute'.
 * @return {Function} The renderer function (Number => String).
 * @name inter.getUnitRenderer
 * @function
 */

/**
 * Render a number in a locale-specific format with a fixed number of
 * decimals. Thousands separators are not supported yet.
 *
 * Example invocation:
 * <pre><code>
 *   inter.renderNumber(14.5, 2, undefined, "kr. "); // "kr. 14,00" (da)
 * </code></pre>
 * @param {Number} number The number to render.
 * @param {Number} numDecimals (optional) The fixed number of
 * decimals, defaults to <tt>0</tt>.
 * @param {Number} factor (optional) Factor to multiply all numbers by
 * (useful for rendering percentages and the likes).
 * @param {String} prefix (optional) String to prefix all renderered
 * numbers with (e.g. <tt>"$"</tt> or <tt>"DKK "</tt>).
 * @param {String} suffix (optional) String to suffix all renderered
 * numbers with (e.g. <tt>"%"</tt> or <tt>" m/s"</tt>).
 * @return {String} The rendered number.
 * @name inter.renderNumber
 * @function
 */

/**
 * Get a locale-specific renderer function for numbers. The renderer
 * outputs a fixed number of decimals. Thousands separators are not
 * supported yet.
 *
 * Example invocation:
 * <pre><code>
 *   var moneyRenderer = inter.getNumberRenderer(2, undefined, "$");
 *   moneyRenderer(14.42442); // "$14.42" (en_US)
 * </code></pre>
 * @param {Number} numDecimals (optional) The fixed number of
 * decimals, defaults to <tt>0</tt>.
 * @param {Number} factor (optional) Factor to multiply all numbers by
 * (useful for rendering percentages and the likes).
 * @param {String} prefix (optional) String to prefix all renderered
 * numbers with (e.g. <tt>"$"</tt> or <tt>"DKK "</tt>).
 * @param {String} suffix (optional) String to suffix all renderered
 * numbers with (e.g. <tt>"%"</tt> or <tt>" m/s"</tt>).
 * @return {Function} The renderer function (Number => String).
 * @name inter.getNumberRenderer
 * @function
 */

/**
 * Render a percentage in a locale-specific format with the locale's
 * preferred percent sign and number format and a fixed number of
 * decimals.
 *
 * Example invocations:
 * <pre><code>
 *   inter.renderPercentage(.42, 3); // "42.000 %" (en_US)
 *   inter.renderPercentage(12, 2); // "1200.00 %" (en_US)
 * </code></pre>
 * @param {Number} number The percentage to render.
 * @param {Number} numDecimals (optional) The fixed number of
 * decimals, defaults to <tt>0</tt>.
 * @returns {String} The rendered percentage.
 * @name inter.renderPercentage
 * @function
 */

/**
 * Get a percentage renderer honoring the locale's preferred percent
 * sign and number format. The renderer outputs a fixed number of
 * decimals.
 *
 * Example invocation:
 * <pre><code>
 *   var renderer = inter.getPercentageRenderer(2);
 *   renderer(.66677); // "66.68 %" (en_US)
 * </code></pre>
 * @param {Number} numDecimals (optional) The fixed number of
 * decimals, defaults to <tt>0</tt>.
 * @returns {Function} The renderer function (Number => String).
 * @name inter.getPercentageRenderer
 * @function
 */

/**
 * Render a file size, ie. a number of bytes, in a locale specific
 * format. Works like {@link Ext.util.Format#fileSize}, but respects
 * the locale's decimal separator. Note: The strings <tt>bytes</tt>,
 * <tt>KB</tt>, <tt>MB</tt>, and <tt>GB</tt> are not localized yet,
 * sorry!
 *
 * Example invocations:
 * <pre><code>
 *   inter.renderFileSize(1024*1024*1024, 2); // "1.00 GB" (en_US)
 *   inter.renderFileSize(4141243, 2); // "3.95 MB" (en_US)
 *   inter.renderFileSize(1008, 2); // "0.98 KB" (en_US)
 * </code></pre>
 * @param {Number} numBytes The file size (number of bytes) to render.
 * @param {Number} numDecimals (optional) The fixed number of
 * decimals, defaults to <tt>0</tt>. Won't be used when the number of
 * bytes is less than or equal to 1000.
 * @return {String} The rendered file size.
 * @name inter.renderFileSize
 * @function
 */

/**
 * Get a locale-specific function for rendering a file size, ie. a
 * number of bytes. The renderer works like {@link
 * Ext.util.Format#fileSize}, but respects the locale's decimal
 * separator. Note: The strings <tt>bytes</tt>, <tt>KB</tt>,
 * <tt>MB</tt>, and <tt>GB</tt> are not localized yet, sorry!
 *
 * Example invocations:
 * <pre><code>
 *   inter.getFileSizeRenderer(2)(41841242); // "39.90 MB" (en_US)
 *   inter.getFileSizeRenderer()(0x40); // "64 bytes"
 * </code></pre>
 * @param {Number} numDecimals (optional) The fixed number of
 * decimals, defaults to <tt>0</tt>. Won't be used when the number of
 * bytes is less than or equal to 1000.
 * @return {Function} The file size renderer (Number => String).
 * @name inter.getFileSizeRenderer
 * @function
 */

/**
 * Render a date or date-time in one of the locale's standard
 * full/long/medium/short time or date formats, or a locale-specific
 * format specified by a CLDR <tt>dateFormatItem</tt> id (<a
 * href='http://unicode.org/reports/tr35/#dateFormats'>see some
 * examples</a>).
 *
 * Example invocations:
 * <pre><code>
 *   var aprilFourth = new Date(2010, 3, 4);
 *   inter.renderDate(aprilFourth, "fullDate"); // "Sunday, April 4, 2010" (en_US)
 *   inter.renderDate(aprilFourth, "shortTime"); // "12:00 am" (en_US)
 *   inter.renderDate(aprilFourth, "MMMMEd"); // "Sun, April 4" (en_US)
 * </code></pre>
 * @param {Date} date The date or date-time to render.
 * @param {String} formatId The CLDR id of the date format, or
 * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
 * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
 * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
 * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
 * @return {String} The rendered date.
 * @name inter.renderDate
 * @function
 */

/**
 * Get a renderer for one of the locale's standard
 * full/long/medium/short time or date formats, or a locale-specifc
 * format specified by a CLDR <tt>dateFormatItem</tt> id (<a
 * href='http://unicode.org/reports/tr35/#dateFormats'>see some
 * examples</a>).
 *
 * Example invocations:
 * <pre><code>
 *   inter.getDateRenderer("mediumTime")(new Date(2010, 5, 7, 22, 30); // "10:30:00 pm" (en_US)
 *   inter.getDateRenderer("longDate")(new Date(2010, 5, 7, 22, 30); // "June 7, 2010" (en_US)
 * </code></pre>
 * @param {String} formatId The CLDR id of the date format, or
 * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
 * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
 * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
 * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
 * @return {Function} The date renderer.
 * @name inter.getDateRenderer
 * @function
 */

/**
 * Render a date or date-time interval using one of the locale's
 * standard full/long/medium/short time or date formats, or a
 * locale-specific format specified by a CLDR <tt>dateFormatItem</tt>
 * id (<a href='http://unicode.org/reports/tr35/#timeFormats'>see some
 * examples</a>).
 *
 * Example invocations:
 * <pre><code>
 *   var firstTenDaysOfJune = {start: new Date(2010, 5, 1), end: new Date(2010, 5, 10)};
 *   inter.renderDateInterval(firstTenDaysOfJune, "yMMd"); // "06/1/2010-06/10/2010" (en_US)
 *   inter.renderDateInterval(firstTenDaysOfJune, "yMMMMd"); // "June 1-10, 2010" (en_US)
 * </code></pre>
 * @param {Object{start: Date, end: Date}} dateInterval The date or
 * date-time interval to render.
 * @param {Boolean} datePartOnly Only render the date part when using
 * a fallback format (defaults to false).
 * @param {String} formatId The CLDR id of the date format, or
 * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
 * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
 * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
 * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
 * @return {Function} The rendered date or date-time interval.
 * @name inter.renderDateInterval
 * @function
 */

/**
 * Get a renderer for a date or date-time interval that uses one of
 * the locale's standard full/long/medium/short time or date formats,
 * or a locale-specific format specified by a CLDR <tt>dateFormatItem</tt>
 * id (<a href='http://unicode.org/reports/tr35/#timeFormats'>see some
 * examples</a>).
 *
 * Example invocation:
 * <pre><code>
 *   var renderer = inter.getDateIntervalRenderer("yMMMM"),
 *       januaryThroughApril = {start: new Date(2010, 0, 1), end: new Date(2010, 4, 0)}
 *   renderer(januaryThroughApril); // "January-April 2010" (en_US)
 * </code></pre>
 * @param {String} formatId The CLDR id of the date format, or
 * <tt>"fullDate"</tt>, <tt>"fullTime"</tt>, <tt>"fullDateTime"</tt>,
 * <tt>"longDate"</tt>, <tt>"longTime"</tt>, <tt>"longDateTime"</tt>,
 * <tt>"mediumDate"</tt>, <tt>"mediumTime"</tt>, <tt>"mediumDateTime"</tt>,
 * <tt>"shortDate"</tt>, <tt>"shortTime"</tt>, or <tt>"shortDateTime"</tt>.
 * @param {Boolean} datePartOnly Only render the date part when using
 * a fallback format (defaults to false).
 * @return {Function} The date or date-time interval renderer,
 * Object{start: Date, end: Date} => String.
 * @name inter.getDateIntervalRenderer
 * @function
 */

/**
 * Render a pattern, ie. substitute all placeholders with the provided
 * values.
 *
 * Example invocation:
 * <pre><code>
 *   inter.renderPattern(["jazz", "blues"], "I like {1} and {0} music"); // "I like blues and jazz music"
 * </code></pre>
 * @param {String[]} placeHolderValues The placeholder values.
 * @param {String} pattern The pattern.
 * @return {String} The rendered pattern.
 * @function
 * @name inter.renderPattern
 */

/**
 * Get a renderer function for a pattern. Fixed values for the the
 * placeholders can be provided as further arguments (JavaScript code
 * fragments). This feature probably has a limited usefulness outside
 * of interlib.Base itself.
 *
 * Example invocation:
 * <pre><code>
 *   var pattern = "WhatThe{0} is {1}?";
 *   inter.getPatternRenderer(pattern)(["Font", "Tahoma"]); // "WhatTheFont is Tahoma?"
 *   inter.getPatternRenderer(pattern, "\"***\"")(["foo", "bar"]); // "WhatThe*** is bar?"
 * </code></pre>
 * @param {String} pattern The pattern.
 * @param {String[]} placeHolderValues (optional) The JavaScript code
 * fragment to use for the first placeholder.
 * @return {Function} The renderer function, String[] (optional) =>
 * String.
 * @name inter.getPatternRenderer
 * @function
 */

// Generate render(Unit|Number|Percentage|FileSize|Date|DateInterval|Pattern)
// and get(Unit|Number|Percentage|FileSize|Date|Interval|Pattern)Renderer
// methods.
// The renderer functions themselves are cached in inter.renderers.

['Unit', 'Number', 'Percentage', 'FileSize', 'Date', 'DateInterval', 'Pattern'].forEach(function (rendererType) {
    if (('make' + rendererType + 'Renderer') in this) {
        this['get' + rendererType + 'Renderer'] = function () { // ...
            var rendererId = rendererType + ':' + [].join.call(arguments, '/');
            return this.renderers[rendererId] || (this.renderers[rendererId] = this['make' + rendererType + 'Renderer'].apply(this, arguments));
        };
        this['render' + rendererType] = function (obj) { // ...
            // this.renderDate(date, format) => this.getDateRenderer(format)(date)
            // this.renderDateInterval(dateInterval, format, datePartOnly) => this.getDateIntervalRenderer(format, datePartOnly)(dateInterval)
            // this.renderPattern(argumentsArray, pattern, codeFragment1, codeFragment2) => this.getPatternRenderer(pattern, codeFragment1, codeFragment2)(argumentsArray)
            var makeRendererArgs = [].slice.call(arguments, 1);
            return (this.renderers[rendererType + ':' + makeRendererArgs.join('/')] || this['get' + rendererType + 'Renderer'].apply(this, makeRendererArgs))(obj);
        };
    }
}, inter);
