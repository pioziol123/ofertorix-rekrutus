exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE matching_weight_versions (
 id uuid PRIMARY KEY, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 weights jsonb NOT NULL, previous_id uuid REFERENCES matching_weight_versions(id),
 command_id uuid UNIQUE, command_hash text, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO matching_weight_versions(id,weights) VALUES('00000000-0000-4000-8000-000000000009','{"technologies":40,"experience":25,"conditions":20,"direction":15}');
CREATE TABLE matching_weight_commands (
 command_id uuid PRIMARY KEY, command_hash text NOT NULL,
 version_id uuid NOT NULL REFERENCES matching_weight_versions(id)
);
CREATE TABLE matching_weight_head (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version_id uuid NOT NULL REFERENCES matching_weight_versions(id)
);
INSERT INTO matching_weight_head(singleton,version_id) VALUES(true,'00000000-0000-4000-8000-000000000009');
CREATE TABLE matching_rating_revisions (
 id uuid PRIMARY KEY, sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 ad_id uuid NOT NULL REFERENCES source_ads(id), request_id uuid UNIQUE REFERENCES matching_requests(id),
 profile_version_id uuid NOT NULL REFERENCES profile_versions(id), ad_revision_id uuid NOT NULL REFERENCES source_ad_revisions(id),
 input jsonb NOT NULL, result jsonb NOT NULL, calculation jsonb NOT NULL,
 weights_version_id uuid NOT NULL REFERENCES matching_weight_versions(id),
 author text NOT NULL CHECK(author IN ('ai','owner','system')),
 assessment_author text NOT NULL CHECK(assessment_author IN ('ai','owner')),
 reason text NOT NULL, previous_revision_id uuid REFERENCES matching_rating_revisions(id), basis_revision_id uuid REFERENCES matching_rating_revisions(id),
 command_id uuid UNIQUE, command_hash text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX matching_rating_history ON matching_rating_revisions(ad_id,sequence DESC);
CREATE TABLE matching_rating_heads (
 ad_id uuid PRIMARY KEY REFERENCES source_ads(id), revision_id uuid NOT NULL REFERENCES matching_rating_revisions(id)
);
INSERT INTO matching_rating_revisions(id,ad_id,request_id,profile_version_id,ad_revision_id,input,result,calculation,weights_version_id,author,assessment_author,reason,created_at)
 SELECT id,ad_id,id,profile_version_id,ad_revision_id,input,result,calculation,'00000000-0000-4000-8000-000000000009','ai','ai','Migracja wcześniejszej ocenyAI',updated_at
 FROM matching_requests WHERE state='completed' AND result IS NOT NULL AND calculation IS NOT NULL ORDER BY updated_at,id;
INSERT INTO matching_rating_heads(ad_id,revision_id)
 SELECT DISTINCT ON (r.ad_id) r.ad_id,r.id FROM matching_rating_revisions r JOIN source_ads a ON a.id=r.ad_id CROSS JOIN profile_head h
 ORDER BY r.ad_id,(r.profile_version_id=h.active_version_id AND r.ad_revision_id=a.current_revision_id) DESC NULLS LAST,r.sequence DESC;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
