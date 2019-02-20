var https = require('https');
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawn = require('child_process').spawn;
var EventEmitter = require('events');
const ID3Writer = require('browser-id3-writer');

var youtubeAPIKey = 'AIzaSyBCshUQSpLKuhmfE5Jc-LEm6vH-sab5Vl8';
var soundcloudAPIKey = 'd02c42795f3bcac39f84eee0ae384b00';
var spotifyAPIKey = 'MTcxYjNkMTZhMTgzNGQ0YWE2MWRjMzM0YTkxZmVlOGU6Yzg2MGNlOWI2YTkyNDlkZmFjNWIyODE3YjA4ZTgxN2U=';
var spotifyAPIToken;
var spotifyAPITokenExpire;

var ytdlbin = path.join(__dirname, 'youtube-dl');

const youtubeIdRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i;
const youtubePlaylistRegex = /youtube\.com\/playlist\?list=(.{10,35})/i;
const deezerTrackIdRegex = /deezer\.com\/track\/(\d{5,10})/i;
const deezerPlaylistIdRegex = /deezer\.com\/.?.?\/?playlist\/(\d{5,15})/i;
const spotifyTrackIdRegex = /(spotify:track:|open\.spotify\.com\/track\/)(\w{22})/i;
const spotifyPlaylistIdRegex = /(spotify:user:|open\.spotify\.com\/user\/)(.*)(\/|:)playlist(\/|:)(\w{22})/i;

// Find info

var findItune = function(query) {
  var ituneOptions = {
    host: 'itunes.apple.com',
    port: 443,
    path: '/search?media=music&term=' + encodeURIComponent(query),
    method: 'GET'
  };

  return callAsync(ituneOptions);
}

var findDeezer = function(query) {
  var deezerOptions = {
    host: 'api.deezer.com',
    port: 443,
    path: '/2.0/search?q=' + encodeURIComponent(query),
    method: 'GET'
  };

  return callAsync(deezerOptions);
}

var findYoutube = function(query, callback) {
  var youtubeOptions = {
    host: 'www.googleapis.com',
    port: 443,
    path: '/youtube/v3/search?part=snippet&key=' + youtubeAPIKey + '&regionCode=US&maxResults=15&q=' + encodeURIComponent(query),
    method: 'GET'
  };

  call(youtubeOptions, function(err, res) {
    callback(err, JSON.parse(res));
  });
}

var getYoutubeVideoInfo = function(youtubeId, callback) {
  var youtubeOptions = {
    host: 'www.googleapis.com',
    port: 443,
    path: '/youtube/v3/videos?part=snippet&key=' + youtubeAPIKey + '&regionCode=US&maxResults=15&id=' + encodeURIComponent(youtubeId),
    method: 'GET'
  };

  call(youtubeOptions, function(err, res) {
    callback(err, JSON.parse(res));
  });
}

// Playlist

var getYoutubePlaylist = function(url, callback, prevRes) {

  if (!youtubePlaylistRegex.test(url))
    callback('Cannot find youtubePlaylistId');

  var id = youtubePlaylistRegex.exec(url)[1];

  var youtubeOptions = {
    host: 'www.googleapis.com',
    port: 443,
    path: '/youtube/v3/playlistItems?part=contentDetails,snippet&key=' + youtubeAPIKey + '&maxResults=50&playlistId=' + encodeURIComponent(id) + (prevRes && prevRes.nextPageToken ? '&pageToken=' + prevRes.nextPageToken : ''),
    method: 'GET'
  };

  call(youtubeOptions, function(err, res) {
    if (err)
      return callback(err);

    res = JSON.parse(res);

    if (prevRes)
      res.items = prevRes.items.concat(res.items);

    if (res.nextPageToken)
      return getYoutubePlaylist(url, callback, res);

    //TODO retour
    callback(err, res.items);
  });
}

var getSoundcloudPlaylist = function(url, callback) {
  var soundcloudOptions = {
    host: 'api.soundcloud.com',
    port: 443,
    path: '/resolve?client_id=' + soundcloudAPIKey + '&url=' + encodeURIComponent(url),
    method: 'GET'
  };

  call(soundcloudOptions, function(err, res) {
    if (err)
      return callback(err);

    soundcloudOptions = {
      host: 'api.soundcloud.com',
      port: 443,
      path: JSON.parse(res).location.substr(26),
      method: 'GET'
    };

    call(soundcloudOptions, function(err, res) {
      if (err)
        return callback(err);

      callback(null, JSON.parse(res).tracks);
    });
  });
}

var getSpotifyPlaylist = function(url, callback) {

  if (!spotifyPlaylistIdRegex.test(url))
    return callback('Cannot find spotifyId');

  getSpotifyToken(function() {
    var temp = spotifyPlaylistIdRegex.exec(url);
    var userId = temp[2];
    var playlistId = temp[5];

    var spotifyOptions = {
      host: 'api.spotify.com',
      port: 443,
      path: '/v1/users/' + userId + '/playlists/' + playlistId + '/tracks',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + spotifyAPIToken
      }
    };

    call(spotifyOptions, function(err, res) {
      if (err)
        return callback(err);

      callback(null, JSON.parse(res).items);
    });
  });
}

var getDeezerPlaylist = function(url, callback) {
  if (!deezerPlaylistIdRegex.test(url))
    return callback('Cannot find deezerId');

  var id = deezerPlaylistIdRegex.exec(url)[1];
  var deezerOptions = {
    host: 'api.deezer.com',
    port: 443,
    path: '/2.0/playlist/' + id,
    method: 'GET'
  };

  call(deezerOptions, function(err, res) {
    if (err)
      return callback(err);

    callback(err, JSON.parse(res).tracks.data);
  });
}

// Get info

var getSoundcloudInfos = function(url, callback, scInfo) {
  var soundcloudOptions = {
    host: 'api.soundcloud.com',
    port: 443,
    path: '/resolve?client_id=' + soundcloudAPIKey + '&url=' + encodeURIComponent(url),
    method: 'GET'
  };

  function callbackFunction(err2, res2) {
    if (err2)
      return callback(err2);

    res2 = typeof(res2) === 'string' ? JSON.parse(res2) : res2;
    var guessed = guessInfoFromTitle(res2.user.username, res2.title);

    findSongFromQuery(guessed[0] + ' - ' + guessed[1], function(err3, res3) {
      res3.soundcloudRes = res2;

      callback(err3, res3);
    });
  }

  if (scInfo)
    callbackFunction(null, scInfo);
  else
    call(soundcloudOptions, function(err, res) {
      if (err)
        return callback(err);
      
      var path;
      
      try {
        path = JSON.parse(res).location.substr(26);
      } catch (e) {
        return callback(e);
      }

      soundcloudOptions = {
        host: 'api.soundcloud.com',
        port: 443,
        path: path,
        method: 'GET'
      }

      call(soundcloudOptions, callbackFunction);
    });
}

var getSpotifyMusicInfos = function(url, callback, stInfo) {

  if (!spotifyTrackIdRegex.test(url))
    return callback('Cannot find spotifyId');

  var id = spotifyTrackIdRegex.exec(url)[2];

  function callbackFunction(err, res) {
    if (err)
      return callback(err);
    res = typeof(res) === 'string' ? JSON.parse(res) : res;
    findYoutube(res.artists[0].name + ' - ' + res.name, function(err2, res2) {
      if (err2)
        return callback(err2);

      var res3 = {};
      res3.youtubeRes = res2.items[0];
      res3.spotifyRes = res;

      callback(null, res3);
    });
  }

  if (stInfo)
    callbackFunction(null, stInfo);
  else {
    getSpotifyToken(function() {
      var spotifyOptions = {
        host: 'api.spotify.com',
        port: 443,
        path: '/v1/tracks/' + id,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + spotifyAPIToken
        }
      };

      call(spotifyOptions, callbackFunction);
    });
  }
}

var getYoutubeMusicInfos = function(url, callback, videoInfo) {
  //Thanks https://stackoverflow.com/questions/6903823/regex-for-youtube-id
  if (!youtubeIdRegex.test(url))
    return callback('Cannot find youtubeID');

  var id = youtubeIdRegex.exec(url)[1];

  function callbackFunction(err, res) {
    if (err || (res.items && res.items.length == 0))
      return callback(err);

    findMusicInVideoDesc(id, function(err2, res2) {
      var guessed;

      if (res2 && res2[0] && res2[1])
        guessed = res2;
      else
        guessed = guessInfoFromTitle(res.items[0].snippet.channelTitle, res.items[0].snippet.title);

      return findSongFromQuery(guessed[0] + ' - ' + guessed[1], function(err, res3) {
        res3.youtubeRes = res.items[0];
        if (!getJson(res3, 'youtubeRes.id.videoId'))
          res3.youtubeRes.id = getJson(res3, 'youtubeRes.contentDetails');

        callback(err, res3);
      });
    });
  }

  if (videoInfo)
    callbackFunction(null, videoInfo);
  else
    getYoutubeVideoInfo(id, callbackFunction);
}

var getDeezerMusicInfos = function(url, callback, dzInfo) {
  if (!deezerTrackIdRegex.test(url))
    return callback('Cannot find deezerId');

  function callbackFunction(err, res) {
    if (err)
      return callback(err);

    res = typeof(res) === 'string' ? JSON.parse(res) : res;
    findYoutube(res.artist.name + ' - ' + res.title, function(err2, res2) {
      if (err2)
        return callback(err2);

      var res3 = {};
      res3.youtubeRes = res2.items[0];
      res3.deezerRes = res;

      callback(null, res3);
    });
  }

  if (dzInfo) {
    callbackFunction(null, dzInfo);
  } else {
    var id = deezerTrackIdRegex.exec(url)[1];

    var deezerOptions = {
      host: 'api.deezer.com',
      port: 443,
      path: '/2.0/track/' + id,
      method: 'GET'
    };

    call(deezerOptions, callbackFunction);
  }
}

// Call

function callAsync(options) {
  return new Promise(function(resolve, reject) {
    var req = https.request(options, function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          return resolve(JSON.parse(body));
        } catch (e) {
          return resolve({
            results: null
          });
        }
      });
    });

    req.on('error', function(e) {
      return reject(e);
      console.log('Problem with request: ' + e.message);
    });

    // write data to request body
    req.end();
  });
}

function call(options, callback, postData) {
  var req = https.request(options, function(res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      return callback(null, body);
    });
  });

  req.on('error', function(e) {
    return callback(e);
    console.log('Problem with request: ' + e.message);
  });

  // write data to request body
  if (postData)
    req.write(postData);

  req.end();
}

//

var findSongFromQuery = async function(query, callback) {
  var deezerRes = findDeezer(query);
  var itunesRes = findItune(query);

  var allResults = await Promise.all([deezerRes, itunesRes]);
  var info = {};

  if (allResults[0] !== undefined && allResults[0].data) {
    info.deezerRes = allResults[0].data[0];
    for (var i = 1; i < allResults[0].data.length; i++) {
      if ((allResults[0].data[i].artist.name + ' - ' + allResults[0].data[i].title).toUpperCase() === query.toUpperCase()) {
        info.deezerRes = allResults[0].data[i];
        break;
      }
    }
  }

  if (allResults[1] !== undefined && allResults[1].results) {
    info.ituneRes = allResults[1].results[0];
    for (var i = 1; i < allResults[1].results.length; i++) {
      if ((allResults[1].results[i].artistName + ' - ' + allResults[1].results[i].trackName).toUpperCase() === query.toUpperCase()) {
        info.ituneRes = allResults[1].results[i];
        break;
      }
    }
  }

  return callback(null, info);
}

var findVideoFromQuery = function(query, callback) {
  var info = {};

  findSongFromQuery(query, function(err, res) {
    if (err)
      callback(err);

    var title, artist;
    var searchQuery = query;

    info = res;
    if (res.deezerRes && res.deezerRes.title)
      title = res.deezerRes.title;
    if (res.deezerRes && res.deezerRes.artist && res.deezerRes.artist.name)
      artist = res.deezerRes.artist.name;

    if (res.ituneRes && res.ituneRes.trackName)
      title = res.ituneRes.trackName;
    if (res.ituneRes && res.ituneRes.artistName)
      artist = res.ituneRes.artistName;

    if (title && artist)
      searchQuery = artist + ' - ' + title;

    findYoutube(searchQuery, function(err, res) {
      if (err)
        callback(err);

      info.youtubeRes = res.items[0];
      callback(null, info);
    });
  });
}

//

function findMusicInVideoDesc(youtubeId, callback) {
  // Try to get the Artist and Title from the "Music used in this video" section of the description. Not in the API
  const regex = /(Artiste|Titre)\n {4}<\/h4>\n {4}<ul class="content watch-info-tag-list">\n {8}<li>(.*)<\/li>/gmi;
  const artistRegex = /Artiste\n {4}<\/h4>\n {4}<ul class="content watch-info-tag-list">\n {8}<li>(<a href=".*" class=".*" >(.*)<\/a>|.*)<\/li>/gmi;
  const titleRegex = /Titre\n {4}<\/h4>\n {4}<ul class="content watch-info-tag-list">\n {8}<li>(<a href=".*" class=".*" >(.*)<\/a>|.*)<\/li>/gmi;

  var youtubeOptions = {
    host: 'www.youtube.com',
    port: 443,
    path: '/watch?v=' + youtubeId,
    method: 'GET'
  };

  call(youtubeOptions, function(err, res) {
    if (err) return callback(err);
    if (regex.test(res)) {
      var title = titleRegex.exec(res);
      var artist = artistRegex.exec(res);
      if (title && artist)
        return callback(null, [artist[2] ? artist[2] : artist[1], title[2] ? title[2] : title[1]]);
      else
        return callback(null, null);
    } else
      return callback(null, null);
  });
}

function guessInfoFromTitle(author, title) {
  var useless = [
    'audio only',
    'audio',
    'paroles/lyrics',
    'lyrics/paroles',
    'with lyrics',
    'w/lyrics',
    'w / lyrics',
    'avec paroles',
    'avec les paroles',
    'avec parole',
    'lyrics',
    'paroles',
    'parole',
    'radio edit.',
    'radio edit',
    'radio-edit',
    'shazam version',
    'shazam v...',
    'music video',
    'clip officiel',
    'officiel',
    'new song',
    'official video',
    'official',
    'original mix',
    '()' // Allways need to be last of the list
  ];

  title = title.toLowerCase();

  for (var i = 0; i < useless.length; i++) {
    title = title.replace(useless[i], '');
  }

  // Remove the [...] things
  title = title.replace(/\[(.*?)\]/g, '');
  // Remove leading and trailing spaces
  title = title.replace(/^\s+|\s+$/g, "");
  var tmp;

  if (/ - /g.test(title)) {
    return title.split(' - ');
  } else if (/ \| /g.test(title)) {
    return title.split(' | ');
  } else if (/ – /g.test(title)) {
    return title.split(' – ');
  } else if (/ : /g.test(title)) {
    return title.split(' – ');
  } else {
    return [author, title];
  }
}

function getJson(obj, path) {
  try {
    return path.split('.').reduce(function(o, k) {
      return o && o[k];
    }, obj);
  } catch (error) {
    return undefined;
  }
}

function getSpotifyToken(callback) {
  if (spotifyAPITokenExpire === undefined || Date.now() > spotifyAPITokenExpire) {
    var postData = 'grant_type=client_credentials';
    var spotifyOptions = {
      host: 'accounts.spotify.com',
      port: 443,
      path: '/api/token',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + spotifyAPIKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    call(spotifyOptions, function(err, res) {
      if (err)
        return callback(err);

      res = JSON.parse(res);
      spotifyAPIToken = res.access_token;
      spotifyAPITokenExpire = Date.now() + (res.expires_in * 1000);
      callback();
    }, postData);
  } else
    return callback();
}

//

function downloadUrl(url, filePath) {
  const downloadEmitter = new EventEmitter();
  const percentRegex = /(\d{0,3}(\.\d))%/;
  const fetchingRegex = /Downloading webpage/;
  const cvStartRegex = /\[ffmpeg\] Correcting container/;
  const cvEndRegex = /Deleting original file/;
  const dlStartRegex = /\[download\] Destination/;
  const dlEndRegex = /\[download\] 100%/;

  var args = ['--audio-quality', '0', '-x', '--audio-format', 'mp3']

  if (filePath) {
    args.push('-o');
    args.push(filePath.split('.').slice(0, -1).join('.') + '.%(ext)s')
  }

  args.push(url);

  var ytm = spawn(ytdlbin, args);

  ytm.stdout.on('data', function(d) {
    var data = d.toString();

    if (percentRegex.test(data)) {
      downloadEmitter.emit('progress', parseFloat(data.match(percentRegex)[1]));
    } else if (fetchingRegex.test(data)) {
      downloadEmitter.emit('fetching');
    } else if (cvStartRegex.test(data)) {
      downloadEmitter.emit('convert-start');
    } else if (cvEndRegex.test(data)) {
      downloadEmitter.emit('convert-end');
    } else if (dlStartRegex.test(data)) {
      downloadEmitter.emit('dl-start');
    } else if (dlEndRegex.test(data)) {
      downloadEmitter.emit('dl-end');
    }
  });

  ytm.stderr.on('data', function(data) {
    data = data.toString();
    if (!data.startsWith('WARNING')) {
      downloadEmitter.emit('error', data);
      console.log('Error when downloading', url, ':', data);
    }
  });

  ytm.on('exit', function(code) {
    if (code.toString() == '0') {
      downloadEmitter.emit('end');
    } else {
      downloadEmitter.emit('end-error', parseInt(code.toString()));
    }
  });

  return downloadEmitter;
}

function downloadCover(url, callback) {
  var coverPath = path.join(os.tmpdir(), Math.random().toString(36).substring(2));
  https.get(url, function(response) {

    response.pipe(fs.createWriteStream(coverPath));

    response.on('end', function() {
      callback(coverPath);
    });

    response.on('error', function(e) {
      console.log(e);
    })
  });
}

function levenshtein(a, b){
  if(a.length == 0) return b.length; 
  if(b.length == 0) return a.length; 

  var matrix = [];

  // increment along the first column of each row
  var i;
  for(i = 0; i <= b.length; i++){
    matrix[i] = [i];
  }

  // increment each column in the first row
  var j;
  for(j = 0; j <= a.length; j++){
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for(i = 1; i <= b.length; i++){
    for(j = 1; j <= a.length; j++){
      if(b.charAt(i-1) == a.charAt(j-1)){
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                Math.min(matrix[i][j-1] + 1, // insertion
                                         matrix[i-1][j] + 1)); // deletion
      }
    }
  }

  return matrix[b.length][a.length];
}

function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

var downloadAndTag = function(url, dlPath, metaData, callback) {
  try {
    var coverUrl;
    var coverPath;

    coverUrl = getJson(metaData, 'deezerRes.album.cover_big') || getJson(metaData, 'ituneRes.artworkUrl100') || getJson(metaData, 'soundcloudRes.artwork_url') ||
      getJson(metaData, 'spotifyRes.album.images.0.url') || getJson(metaData, 'youtubeRes.snippet.thumbnails.standard.url') ||
      getJson(metaData, 'youtubeRes.snippet.thumbnails.high.url') || getJson(metaData, 'youtubeRes.snippet.thumbnails.default.url');

    if (coverUrl) {
      // Ugly but speed up process
      downloadCover(coverUrl, function(res) {
        coverPath = res;
      });
    }

    var info = {};
    var titleFound = getJson(metaData, 'deezerRes.title') || getJson(metaData, 'ituneRes.trackName') || getJson(metaData, 'spotifyRes.name');
    var guessed;
    if (metaData.youtubeRes)
      guessed = guessInfoFromTitle(metaData.youtubeRes.snippet.channelTitle, metaData.youtubeRes.snippet.title);
    else if (metaData.soundcloudRes)
      guessed = guessInfoFromTitle(metaData.soundcloudRes.user.username, metaData.soundcloudRes.title);

    info.tags = getJson(metaData, 'youtubeRes.snippet.tags');
    if ((!metaData.ituneRes && !metaData.deezerRes && !metaData.spotifyRes) || (guessed !== undefined && levenshtein(guessed[1], titleFound || "") > 10 )) {
      if (metaData.youtubeRes) {
        info.artistName = toTitleCase(guessed[0]);
        info.title = toTitleCase(guessed[1]);
        info.cover = coverUrl;
      } else if (metaData.soundcloudRes) {
        info.tags = getJson(metaData, 'soundcloudRes.tag_list').split(' ');
        info.artistName = toTitleCase(guessed[0]);
        info.title = toTitleCase(guessed[1]);
        info.cover = coverUrl;
        info.genre = getJson(metaData, 'soundcloudRes.genre');
        var releaseYear = getJson(metaData, 'soundcloudRes.release_year');
        if (releaseYear)
          info.releaseYear = parseInt(releaseYear);
        info.trackWebpage = getJson(metaData, 'soundcloudRes.permalink_url');
        info.songDurationMs = getJson(metaData, 'soundcloudRes.duration');
      }
    } else {
      info.title = titleFound;
      info.genre = getJson(metaData, 'ituneRes.primaryGenreName');
      info.artistName = getJson(metaData, 'deezerRes.artist.name') || getJson(metaData, 'ituneRes.artistName') || getJson(metaData, 'spotifyRes.artists.0.name');
      info.albumName = getJson(metaData, 'deezerRes.album.title') || getJson(metaData, 'ituneRes.collectionName') || getJson(metaData, 'spotifyRes.album.name');
      info.trackPosition = getJson(metaData, 'ituneRes.trackNumber') || getJson(metaData, 'spotifyRes.track_number');
      info.trackCount = getJson(metaData, 'ituneRes.trackCount');
      info.discCount = getJson(metaData, 'ituneRes.discCount') || getJson(metaData, 'spotifyRes.disc_number');
      info.discPosition = getJson(metaData, 'ituneRes.discPosition');
      info.trackWebpage = getJson(metaData, 'deezerRes.link') || getJson(metaData, 'ituneRes.trackViewUrl') || getJson(metaData, 'spotifyRes.external_urls.spotify');
      info.artistWebpage = getJson(metaData, 'deezerRes.artist.link') || getJson(metaData, 'ituneRes.artistViewUrl') || getJson(metaData, 'spotifyRes.artists.0.external_urls.spotify');
      info.songDurationMs = getJson(metaData, 'ituneRes.trackTimeMillis') || (getJson(metaData, 'deezerRes.duration') * 1000) || getJson(metaData, 'spotifyRes.duration_ms');
      var releaseDate = getJson(metaData, 'ituneRes.releaseDate') || getJson(metaData, 'spotifyRes.album.release_date');
      if (releaseDate)
        info.releaseYear = parseInt(releaseDate.substr(0, 4));
      info.cover = coverUrl;
      info.ituneId = getJson(metaData, 'ituneRes.trackId');
      info.deezerId = getJson(metaData, 'deezerRes.id');
      info.spotifyId = getJson(metaData, 'spotifyRes.id');
      info.deezerAlbumId = getJson(metaData, 'deezerRes.album.id');
      info.ituneAlbumId = getJson(metaData, 'ituneRes.collectionId');
      info.spotifyAlbumId = getJson(metaData, 'spotifyRes.album.id');
    }

    var fileName = info.artistName + ' - ' + (info.trackPosition === undefined ? '' : info.trackPosition.toString() + ' - ') + info.title;
    fileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 \-\(\)]/gi, '_');
    var filePath = path.join(dlPath, fileName + '.mp3');

    var dl = downloadUrl(url, filePath);

    dl.on('end', function() {
      tagFile(filePath, coverPath, info, callback);
    });

    dl.on('error', function(error) {
      callback(error);
    });

    return dl;
  } catch(error) {
    callback(error);
    return null;
  }
}

//

function tagFile(filePath, coverPath, info, callback) {
  const songBuffer = fs.readFileSync(filePath);

  const writer = new ID3Writer(songBuffer);
  if (info.title)
    writer.setFrame('TIT2', info.title);
  if (info.genre)
    writer.setFrame('TCON', [info.genre]);
  if (info.artistName) {
    writer.setFrame('TPE1', [info.artistName]);
    writer.setFrame('TPE2', info.artistName);
  }
  if (info.albumName)
    writer.setFrame('TALB', info.albumName);
  if (info.trackPosition) {
    if (info.trackCount)
      writer.setFrame('TRCK', info.trackPosition + '/' + info.trackCount);
    else
      writer.setFrame('TRCK', info.trackPosition);
  }
  if (info.discPosition) {
    if (info.discCount)
      writer.setFrame('TPOS', info.discPosition + '/' + info.discCount);
    else
      writer.setFrame('TPOS', info.discPosition);
  }
  if (info.trackWebpage)
    writer.setFrame('WOAF', info.trackWebpage);
  if (info.artistWebpage)
    writer.setFrame('WOAR', info.artistWebpage);
  if (info.songDurationMs)
    writer.setFrame('TLEN', parseInt(info.songDurationMs));
  if (info.releaseYear)
    writer.setFrame('TYER', parseInt(info.releaseYear));
  if (coverPath) {
    const coverBuffer = fs.readFileSync(coverPath);

    writer.setFrame('APIC', {
      type: 3,
      data: coverBuffer,
      description: 'Dubbatransitek'
    });
  }
  writer.addTag();

  const taggedSongBuffer = Buffer.from(writer.arrayBuffer);
  fs.writeFileSync(filePath, taggedSongBuffer);
  callback(null, filePath, info);
}

//

var sanitizeUrl = function(url) {
  if (youtubeIdRegex.test(url))
    return 'https://www.youtube.com/watch?v=' + youtubeIdRegex.exec(url)[1];

  if (youtubePlaylistRegex.test(url))
    return 'https://www.youtube.com/playlist?list=' + youtubePlaylistRegex.exec(url)[1];

  if (deezerTrackIdRegex.test(url))
    return 'https://www.deezer.com/track/' + deezerTrackIdRegex.exec(url)[1];

  if (deezerPlaylistIdRegex.test(url))
    return 'https://www.deezer.com/playlist/' + deezerPlaylistIdRegex.exec(url)[1];

  if (spotifyTrackIdRegex.test(url))
    return 'https://open.spotify.com/track/' + spotifyTrackIdRegex.exec(url)[2];

  if (spotifyPlaylistIdRegex.test(url)) {
    var temp = spotifyPlaylistIdRegex.exec(url);
    var userId = temp[2];
    var playlistId = temp[5];
    return 'https://open.spotify.com/user/' + userId + '/playlist/' + playlistId;
  }

  return url;
}

exports.findItune = findItune;
exports.findDeezer = findDeezer;
exports.findYoutube = findYoutube;
exports.getYoutubeVideoInfo = getYoutubeVideoInfo;
exports.getYoutubePlaylist = getYoutubePlaylist;
exports.getSoundcloudPlaylist = getSoundcloudPlaylist;
exports.getSpotifyPlaylist = getSpotifyPlaylist;
exports.getDeezerPlaylist = getDeezerPlaylist;
exports.getSoundcloudInfos = getSoundcloudInfos;
exports.getSpotifyMusicInfos = getSpotifyMusicInfos;
exports.getYoutubeMusicInfos = getYoutubeMusicInfos;
exports.getDeezerMusicInfos = getDeezerMusicInfos;
exports.findSongFromQuery = findSongFromQuery;
exports.findVideoFromQuery = findVideoFromQuery;
exports.downloadAndTag = downloadAndTag;
exports.sanitizeUrl = sanitizeUrl;
