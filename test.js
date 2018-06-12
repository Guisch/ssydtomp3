var ssyd = require('./index');

var urlSc = 'https://soundcloud.com/ben-klock/ben-klock-subzero-original-mix';
var urlYt = 'https://www.youtube.com/watch?v=wQDxGKsrgSc';
var urlSt = 'https://open.spotify.com/track/3yndKI4zWEyC36BQYrdKBA';
var urlDz = 'https://www.deezer.com/track/61424044?utm_source=deezer&utm_content=track-61424044&utm_term=8830841_1528498835&utm_medium=web';

var urlYtPl = 'https://www.youtube.com/playlist?list=PLbhQKJTW_r3grUKrIkKrnDDPxFTe75_oO';
var urlScPl = 'https://soundcloud.com/anisketsui/sets/technos-moons';
var urlStPl = 'https://open.spotify.com/user/warnerfrspotify/playlist/6BPZpwdBp797pxcPDmHfyw?si=DeTZ0b7bT3mRtk_BZlfzGg';
var urlDzPl = 'https://www.deezer.com/playlist/1275756721';

ssyd.findVideoFromQuery('LAURENT GARNIER - Crispy Bacon', function(err, res) {
  ssyd.downloadAndTag('https://www.youtube.com/watch?v=' + res.youtubeRes.id.videoId, './', res, function(err, res) {
    console.log(err, res);
  });
});

ssyd.getSoundcloudInfos(urlSc, function(err, res) {
  ssyd.downloadAndTag(urlSc, './', res, function(err, res) {
    console.log(err, res);
  });
});

ssyd.getYoutubeMusicInfos(urlYt, function(err, res) {
  ssyd.downloadAndTag(urlYt, './', res, function(err, res) {
    console.log(err, res);
  });
});

ssyd.getSpotifyMusicInfos(urlSt, function(err, res) {
  ssyd.downloadAndTag('https://www.youtube.com/watch?v=' + res.youtubeRes.id.videoId, './', res, function(err, res) {
    console.log(err, res);
  });
});

ssyd.getDeezerMusicInfos(urlDz, function(err, res) {
  ssyd.downloadAndTag('https://www.youtube.com/watch?v=' + res.youtubeRes.id.videoId, './', res, function(err, res) {
    console.log(err, res);
  });
});

ssyd.getYoutubePlaylist(urlYtPl, function(err, res) {
  ssyd.getYoutubeMusicInfos('https://www.youtube.com/watch?v=' + res[0].contentDetails.videoId, function(err, res) {
    ssyd.downloadAndTag('https://www.youtube.com/watch?v=' + res.youtubeRes.id.videoId, './', res, function(err, res) {
      console.log(err, res);
    });
  }, {
    items: [res[0]]
  });
});

ssyd.getSoundcloudPlaylist(urlScPl, function(err, res1) {
  ssyd.getSoundcloudInfos(res1[1].permalink_url, function(err, res) {
    ssyd.downloadAndTag(res1[1].permalink_url, './', res, function(err, res) {
      console.log(err, res);
    });
  }, res1[1]);
});

ssyd.getSpotifyPlaylist(urlStPl, function(err, res) {
  ssyd.getSpotifyMusicInfos(res[1].track.external_urls.spotify, function(err, res) {
    ssyd.downloadAndTag('https://www.youtube.com/watch?v=' + res.youtubeRes.id.videoId, './', res, function(err, res) {
      console.log(err, res);
    });
  }, res[1].track);
});

ssyd.getDeezerPlaylist(urlDzPl, function(err, res) {
  ssyd.getDeezerMusicInfos(res[1].link, function(err, res) {
    ssyd.downloadAndTag('https://www.youtube.com/watch?v=' + res.youtubeRes.id.videoId, './', res, function(err, res) {
      console.log(err, res);
    });
  }, res[1]);
});
